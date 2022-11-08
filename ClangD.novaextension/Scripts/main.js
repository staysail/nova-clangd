// configuration keys
const cfgLspFlavor = "tech.staysail.cdragon.lsp.flavor";
const cfgLspPath = "tech.staysail.cdragon.lsp.path";
const cfgFormatOnSave = "tech.staysail.cdragon.format.onSave";

// command names
const cmdFormatFile = "tech.staysail.cdragon.formatFile";
const cmdRenameSymbol = "tech.staysail.cdragon.renameSymbol";
const cmdPreferences = "tech.staysail.cdragon.preferences";

// messages (to aid localization)
let messages = {};

const msgNoLspClient = "msgNoLspClient";
const msgNothingSelected = "msgNothingSelected";
const msgUnableToResolveSelection = "msgUnableToResolveSelection";
const msgRenameSymbol = "msgRenameSymbol";
const msgNewName = "msgNewName"; // for renaming symbols
const msgSelectionNotSymbol = "msgSelectionNotSymbol";
const msgCouldNotRenameSym = "msgCouldNotRenameSymbol";
const msgUnableToApply = "msgUnableToApply";
const msgUnableToOpen = "msgUnableToOpen";

messages[msgNoLspClient] = "No LSP client";
messages[msgNothingSelected] = "Nothing is selected";
messages[msgUnableToResolveSelection] = "Unable to resolve selection";
messages[msgRenameSymbol] = "Rename symbol OLD_SYMBOL";
messages[msgNewName] = "New name";
messages[msgSelectionNotSymbol] = "Selection is not a symbol";
messages[msgCouldNotRenameSym] = "Could not rename symbol";
messages[msgUnableToApply] = "Unable to apply changes";
messages[msgUnableToOpen] = "Unable to open URI";

// LSP flavors
const flavorApple = "apple";
const flavorLLVM = "clangd";
const flavorCCLS = "ccls";
const flavorNone = "none";

// global variables
var langserver = null;
var lspFlavor = flavorNone;
var lspPath = "";

exports.activate = function () {
  // Do work when the extension is activated
  langserver = new ClangDLanguageServer();

  nova.workspace.onDidAddTextEditor((editor) => {
    if (editor.document.syntax != "c" && editor.document.syntax != "cpp")
      return;
    editor.onWillSave((editor) => {
      const formatOnSave = nova.workspace.config.get(cfgFormatOnSave);
      if (formatOnSave) {
        return formatFile(editor);
      }
    });
  });

  nova.commands.register(cmdFormatFile, formatFileCmd);
  nova.commands.register(cmdRenameSymbol, renameSymbolCmd);
  nova.commands.register(cmdPreferences, openPreferences);

  nova.config.observe(cfgLspFlavor, function (flavor) {
    if (lspFlavor == flavor) {
      return;
    }
    lspFlavor = flavor;
    switch (flavor) {
      case flavorApple:
        nova.config.set(cfgLspPath, "/usr/bin/clangd");
        break;
      case flavorLLVM:
        nova.config.set(cfgLspPath, "/usr/local/bin/clangd");
        break;
      case flavorCCLS:
        nova.config.set(cfgLspPath, "/usr/local/bin/ccls");
        break;
      case flavorNone:
        nova.config.set(cfgLspPath);
        break;
    }
  });
  nova.config.observe(cfgLspPath, function (path) {
    if (lspPath == path) {
      return;
    }
    lspPath = path;
    restartServer();
  });
};

exports.deactivate = function () {
  // Clean up state before the extension is deactivated
  if (langserver) {
    langserver.deactivate();
    langserver = null;
  }
};

function getMsg(key) {
  console.error("KEY", key, "VAL", messages[key]);
  return nova.localize(key, messages[key]);
}

function showError(err) {
  // strip off the LSP error code; few users can grok it anyway
  m = err.match(/-3\d\d\d\d\s+(.*)/);
  if (m && m[1]) {
    nova.workspace.showErrorMessage(m[1]);
  } else {
    nova.workspace.showErrorMessage(err);
  }
}

function openPreferences(_) {
  nova.workspace.openConfig();
}

async function formatFileCmd(editor) {
  try {
    await formatFile(editor);
  } catch (err) {
    showError(err);
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
      nova.workspace.showErrorMessage(getMsg(msgNoLspClient));
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
    showError(err);
  }
}

async function renameSymbol(editor) {
  if (!langserver || !langserver.languageClient) {
    nova.workspace.showErrorMessage(getMsg(msgNoLspClient));
    return;
  }
  var client = langserver.languageClient;

  // we have to do this because there is no way to ask
  // for just the current editor cursor position
  editor.selectWordsContainingCursors();

  const selected = editor.selectedRange;
  if (!selected) {
    nova.workspace.showErrorMessage(getMsg(msgNothingSelected));
    return;
  }
  selectedPos = novaPositionToLspPosition(editor.document, selected.start);
  if (!selectedPos) {
    nova.workspace.showErrorMessage(getMsg(msgUnableToResolveSelection));
    return;
  }
  let oldName = editor.selectedText;

  switch (lspFlavor) {
    case flavorApple:
    case flavorLLVM:
      // these (version 13 and newer at least) have prepare rename support
      const prepResult = await client.sendRequest(
        "textDocument/prepareRename",
        {
          textDocument: { uri: editor.document.uri },
          position: selectedPos,
        }
      );
      if (prepResult.placeholder) {
        oldName = prepResult.placeholder;
      } else if (prepResult.range) {
        oldName = editor.document.getTextInRange(
          lspRangeToNovaRange(editor.document, prepResult.range)
        );
      } else if (prepResult.start) {
        oldName = editor.document.getTextInRange(
          lspRangeToNovaRange(editor.document, prepResult)
        );
      }
      break;
    case flavorCCLS:
      // CCLS does not have support for prepRename yet.
      // When Nova supports unicode classes, change this:
      // if (oldName.match(/^[_\p{XID_Start}][\p{XID_Continue}]*/)) {
      // }
      let m = oldName.match(/[_a-zA-Z][A-Za-z0-9_]*/);
      if (!m || m[0] != oldName) {
        nova.workspace.showErrorMessage(getMsg(msgSelectionNotSymbol));
        return;
      }
  }

  const newName = await new Promise((resolve) => {
    nova.workspace.showInputPanel(
      getMsg(msgRenameSymbol).replace("OLD_SYMBOL", oldName),
      { placeholder: oldName, value: oldName, label: getMsg(msgNewName) },
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

  const response = await client.sendRequest("textDocument/rename", params);

  if (!response) {
    nova.workspace.showWarningMessage(getMsg(msgCouldNotRenameSym));
  }

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
      nova.workspace.showWarningMessage(getMsg(msgUnableToApply));
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
        continue;
      }
      const editor = await nova.workspace.openFile(uri);
      if (!editor) {
        nova.workspace.showWarningMessage(
          getMsg(msgUnableToOpen).replace("URI", uri)
        );
        continue;
      }
      lspApplyEdits(editor, edits);
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
      nova.workspace.showWarningMessage(
        getMsg(msgUnableToOpen).replace("URI", uri)
      );
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

function restartServer() {
  if (langserver) {
    lsp = langserver;
    langserver = null;
    lsp.deactivate();
  }

  flavor = nova.config.get(cfgLspFlavor);
  if (!flavor || flavor == flavorNone) {
    return;
  }
  langserver = new ClangDLanguageServer();
  langserver.start();
}

class ClangDLanguageServer {
  constructor() {}

  deactivate() {
    this.stop();
  }

  start(path) {
    if (this.languageClient) {
      this.languageClient.stop();
      nova.subscriptions.remove(this.languageClient);
      this.languageClient = null;
    }

    let flavor = nova.config.get(cfgLspFlavor);
    if (flavor == flavorNone) {
      return;
    }
    if (!flavor) {
      flavor = flavorApple;
    }

    let CCPath = nova.config.get("staysail.clangd-cc-path", "string");
    if (!CCPath)
      CCPath = nova.workspace.config.get("staysail.clangd-cc-path", "string");
    if (!CCPath) CCPath = nova.workspace.path;

    if (!path) {
      path = nova.config.get(cfgLspPath);
    }

    let args = [];

    // Use the default server path
    if (!path) {
      return; // no path
    }

    switch (flavor) {
      case flavorApple:
        args = ["--compile-commands-dir=" + CCPath];
        break;
      case flavorLLVM:
        args = ["--compile-commands-dir=" + CCPath, "--log-verbose"];
        break;
      case flavorCCLS:
        args = [
          '--init={ "compilationDatabaseDirectory": "' + CCPath + '" }',
          "--print-all-options",
        ];
        break;
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
