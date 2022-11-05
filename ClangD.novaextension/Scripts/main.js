var langserver = null;

exports.activate = function () {
  // Do work when the extension is activated
  langserver = new ClangDLanguageServer();

  nova.workspace.onDidAddTextEditor((editor) => {
    if (editor.document.syntax != "c" && editor.document.syntax != "cpp")
      return;
    editor.onWillSave((editor) => {
      const formatOnSave = nova.workspace.config.get(
        "staysail.clangd-format-on-save"
      );
      if (formatOnSave) {
        return formatFile(editor);
      }
    });
  });

  nova.commands.register("staysail.clangd.format", formatFileCmd);
};

exports.deactivate = function () {
  // Clean up state before the extension is deactivated
  if (langserver) {
    langserver.deactivate();
    langserver = null;
  }
};

async function formatFileCmd(editor) {
  try {
    await formatFile(editor);
  } catch (err) {
    nova.workspace.showErrorMessage(err);
  }
}

function lspApplyEdits(editor, edits) {
  return editor.edit((textEditorEdit) => {
    for (const change of edits.reverse()) {
      const range = lspRangeToNovaRange(editor.document, change.range);
      textEditorEdit.replace(range, change.newText);
    }
  });
}

async function formatFile(editor) {
  if (langserver && langserver.languageClient) {
    var cmdArgs = {
      textDocument: {
        uri: editor.document.uri,
      },
      options: {
        tabSize: editor.tabLength,
        insertSpaces: editor.softTabs,
      },
      // TBD: options
    };
    var client = langserver.languageClient;
    if (!client) {
      nova.workspace.showErrorMessages("no ClangD client");
      return;
    }
    const changes = await client.sendRequest(
      "textDocument/formatting",
      cmdArgs
    );

    if (!changes) {
      return;
    }
    await lspApplyEdits(editor, changes);
  }
}

// Nova ranges are absolute character offsets
// LSP ranges based on line/column.
function lspRangeToNovaRange(document, range) {
  let pos = 0;
  let start = 0;
  let end = document.length;
  const lines = document
    .getTextInRange(new Range(0, document.length))
    .split(document.eol);
  for (let line = 0; line < lines.length; line++) {
    if (range.start.line == line) {
      start = pos + range.start.character;
    }
    if (range.end.line == line) {
      end = pos + range.end.character;
      break; // we finished, so no need to keep scanning the doc
    }
    pos += lines[line].length + document.eol.length;
  }
  let res = new Range(start, end);
  return res;
}

class ClangDLanguageServer {
  constructor() {
    // Observe the configuration setting for the server's location, and restart the server on change
    nova.config.observe(
      "staysail.clangd-path",
      function (path) {
        this.start(path);
      },
      this
    );

    nova.config.observe(
      "staysail.clangd-path",
      function () {
        this.start(nova.config.get("staysail.clangd-path", "string"));
      },
      this
    );

    nova.workspace.config.observe(
      "staysail.clangd-path",
      function () {
        this.start(nova.config.get("staysail.clangd-path", "string"));
      },
      this
    );
  }

  deactivate() {
    this.stop();
  }

  start(path) {
    if (this.languageClient) {
      this.languageClient.stop();
      nova.subscriptions.remove(this.languageClient);
    }

    // Use the default server path
    if (!path) {
      path = "/usr/bin/clangd";
    }

    let CCPath = nova.config.get("staysail.clangd-path", "string");
    if (!CCPath)
      CCPath = nova.workspace.config.get("staysail.clangd-path", "string");
    if (!CCPath) CCPath = nova.workspace.path;

    // Create the client
    var serverOptions = {
      path: path,
      args: ["--compile-commands-dir=" + CCPath, "--suggest-missing-includes"],
    };
    var clientOptions = {
      // The set of document syntaxes for which the server is valid
      syntaxes: ["c", "cpp"],
    };
    var client = new LanguageClient(
      "clang-langserver",
      "clang Language Server",
      serverOptions,
      clientOptions
    );

    try {
      // Start the client
      client.start();

      // Add the client to the subscriptions to be cleaned up
      nova.subscriptions.add(client);
      this.languageClient = client;
    } catch (err) {
      // If the .start() method throws, it's likely because the path to the language server is invalid

      if (nova.inDevMode()) {
        console.error(err);
      }
    }
  }

  stop() {
    if (this.languageClient) {
      this.languageClient.stop();
      nova.subscriptions.remove(this.languageClient);
      this.languageClient = null;
    }
  }
}
