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
  nova.commands.register("staysail.clangd.rename", renameSymbolCmd);
  nova.commands.register("staysail.clangd.preferences", openPreferences);
};

exports.deactivate = function () {
  // Clean up state before the extension is deactivated
  if (langserver) {
    langserver.deactivate();
    langserver = null;
  }
};

function openPreferences(editor) {
  nova.workspace.openConfig();
}

async function formatFileCmd(editor) {
  try {
    await formatFile(editor);
  } catch (err) {
    nova.workspace.showErrorMessage(err);
  }
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
      nova.workspace.showErrorMessage("No LSP client");
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

async function renameSymbolCmd(editor) {
  try {
    await renameSymbol(editor);
  } catch (err) {
    nova.workspace.showErrorMessage(err);
  }
}

async function renameSymbol(editor) {
  if (!langserver || !langserver.languageClient) {
    nova.workspace.showErrorMessage("No LSP client");
    return;
  }
  var client = langserver.languageClient;

  editor.selectWordsContainingCursors();

  const selected = editor.selectedRange;
  if (!selected) {
    nova.workspace.showErrorMessage("Nothing is selected");
    return;
  }
  selectedPos = novaPositionToLspPosition(editor.document, selected.start);
  if (!selectedPos) {
    nova.workspace.showErrorMessage("Unable to resolve selection");
    return;
  }
  const oldName = editor.selectedText;
  const newName = await new Promise((resolve) => {
    nova.workspace.showInputPalette(
      "Rename symbol to",
      { placeholder: oldName, value: oldName },
      resolve
    );
  });

  if (!newName || newName == oldName) {
    return;
  }

  const params = {
    newName: newName,
    position: {
      line: Number(selectedPos.line),
      character: Number(selectedPos.character),
    },
    textDocument: { uri: editor.document.uri },
  };

  console.error("Sending", JSON.stringify(params));

  const response = await client.sendRequest("textDocument/rename", params);

  if (!response) {
    nova.workspace.showWarningMessage("Couldn't rename symbol");
  }

  console.error("Received", JSON.stringify(response));

  lspApplyWorkspaceEdits(response);

  // return to original location
  await nova.workspace.openFile(editor.document.uri);
  editor.scrollToCursorPosition();
}

// changes in reverse order, so that earlier changes
// do not disrupt later ones.  some methods and
// servers give them to us in sensible order,
// others do it in reverse.
function sortChangesReverse(changes) {
  let result = changes.sort(function (a, b) {
    if (a.range.start.line != b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  console.error("sorted: ", JSON.stringify(result));
  return result;
}
function lspApplyEdits(editor, edits) {
  return editor.edit((textEditorEdit) => {
    for (const change of sortChangesReverse(edits)) {
      const range = lspRangeToNovaRange(editor.document, change.range);
      textEditorEdit.replace(range, change.newText);
    }
  });
}

async function lspApplyWorkspaceEdits(edit) {
  // at present we only support the simple changes field.
  // to support richer document changes we will need to express
  // more capabilities during negotiation.
  if (!edit.changes) {
    // this should come in the form of a documentChanges
    if (!edit.documentChanges) {
      nova.workspace.showWarningMessage("Unable to apply any changes");
      return;
    }
    // Note that we can only support edits not creates or renames
    // and not annotations.  But this is good enough for CCLS.
    // We also don't have any notion of document versioning.
    for (const dc in edit.documentChanges) {
      // Possibly support rename, create, and delete operations
      const uri = edit.documentChanges[dc].textDocument.uri;
      let edits = edit.documentChanges[dc].edits;
      if (!edits.length) {
        console.error("missing edits for", uri);
        continue;
      }
      console.error("applying changines for", uri);
      const editor = await nova.workspace.openFile(uri);
      if (!editor) {
        nova.workspace.showWarningMessage("Unable to open ${uri}");
        continue;
      }
      lspApplyEdits(editor, edits);
      // convert to the legacy style
      // edit.changes[uri] = edit.edits;
    }
    return;
  }

  // legacy simple changes
  for (const uri in edit.changes) {
    const changes = edit.changes[uri];
    if (!changes.length) {
      continue; // this should not happen
    }
    const editor = await nova.workspace.openFile(uri);
    if (!editor) {
      nova.workspace.showWarningMessage("Unable to open ${uri}");
      continue;
    }
    lspApplyEdits(editor, changes);
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

function novaRangeToLspRange(document, range) {
  const lines = document
    .getTextInRange(new Range(0, document.length))
    .split(document.eol);
  let pos = 0;
  let start = undefined;
  let end = undefined;
  for (let line = 0; line < lines.length; line++) {
    if (!start && pos + lines[line].length >= range.start) {
      start = { line: line, character: range.start - pos };
    }
    if (!end && pos + lines[line].length >= range.end) {
      end = { line: line, character: range.end - pos };
      return { start: start, end: end };
    }
    pos += lines[line].length + document.eol.length;
  }
  return null;
}

function novaPositionToLspPosition(document, where) {
  const lines = document
    .getTextInRange(new Range(0, document.length))
    .split(document.eol);
  let pos = 0;
  for (let line = 0; line < lines.length; line++) {
    if (pos + lines[line].length >= where) {
      return { character: Number(where - pos), line: Number(line) };
    }
    pos += lines[line].length + document.eol.length;
  }
  return null;
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

    let lsp = nova.config.get("staysail.clangd-lsp");
    if (!lsp) {
      lsp = "clangd";
    }

    let CCPath = nova.config.get("staysail.clangd-cc-path", "string");
    if (!CCPath)
      CCPath = nova.workspace.config.get("staysail.clangd-cc-path", "string");
    if (!CCPath) CCPath = nova.workspace.path;

    let args = [];

    // Use the default server path
    if (!path) {
      if (lsp == "clangd") {
        path = "/usr/bin/clangd";
      } else if (lsp == "ccls") {
        path = "/opt/homebrew/bin/ccls";
      }
    }

    if (lsp == "clangd") {
      args = ["--compile-commands-dir=" + CCPath, "--log-verbose"];
    } else if (lsp == "ccls") {
      args = [
        '--init={ "compilationDatabaseDirectory": "' + CCPath + '" }',
        "--print-all-options",
      ];
    } else {
      args = [];
    }
    // Create the client
    var serverOptions = {
      path: path,
      args: args,
    };
    var clientOptions = {
      // The set of document syntaxes for which the server is valid
      syntaxes: ["c", "cpp"],
    };
    var client = new LanguageClient(
      "cdragon-langserver",
      "C-Dragon Language Server",
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
