// configuration keys
const cfgLspFlavor = "tech.staysail.cdragon.lsp.flavor";
const cfgLspPath = "tech.staysail.cdragon.lsp.path";
const cfgFormatOnSave = "tech.staysail.cdragon.format.onSave";

// command names
const cmdFormatFile = "tech.staysail.cdragon.formatFile";
const cmdRenameSymbol = "tech.staysail.cdragon.renameSymbol";
const cmdPreferences = "tech.staysail.cdragon.preferences";
const cmdRestart = "tech.staysail.cdragon.restart";

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
const msgLspStoppedErr = "msgLspStoppedErr";
const msgLspDidNotStart = "msgLspDidNotStart";
const msgLspRestarted = "msgLspRestarted";

messages[msgNoLspClient] = "No LSP client";
messages[msgNothingSelected] = "Nothing is selected";
messages[msgUnableToResolveSelection] = "Unable to resolve selection";
messages[msgRenameSymbol] = "Rename symbol _OLD_SYMBOL_";
messages[msgNewName] = "New name";
messages[msgSelectionNotSymbol] = "Selection is not a symbol";
messages[msgCouldNotRenameSym] = "Could not rename symbol";
messages[msgUnableToApply] = "Unable to apply changes";
messages[msgUnableToOpen] = "Unable to open URI";
messages[msgLspStoppedErr] = "Language server stopped with an error.";
messages[msgLspDidNotStart] = "Language server failed to start.";
messages[msgLspRestarted] = "Language server restarted.";

// LSP flavors
const flavorApple = "apple";
const flavorLLVM = "clangd";
const flavorCCLS = "ccls";
const flavorNone = "none";

// global variables
var lspServer = null;
var lspFlavor = flavorNone;
var lspPath = "";

exports.activate = async function () {
  console.log("ACTIVATING");
  // Do work when the extension is activated
  try {
    lspServer = new ClangDLanguageServer();
    await lspServer.start();
  } catch (error) {
    console.error("Failed starting up", error.message);
  }

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
  nova.commands.register(cmdRestart, restartServer);

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
  if (lspServer) {
    lspServer.deactivate();
    lspServer = null;
  }
};

function getMsg(key) {
  return nova.localize(key, messages[key]);
}

function showError(err) {
  // strip off the LSP error code; few users can grok it anyway
  var m = err.match(/-3\d\d\d\d\s+(.*)/);
  if (m && m[1]) {
    nova.workspace.showErrorMessage(m[1]);
  } else {
    nova.workspace.showErrorMessage(err);
  }
}

function showNotice(title, body) {
  var req = new NotificationRequest();
  req.title = title;
  req.body = body;
  nova.notifications.add(req);
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
  if (lspServer && lspServer.lspClient) {
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
    var client = lspServer.lspClient;
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
  if (!lspServer || !lspServer.lspClient) {
    nova.workspace.showErrorMessage(getMsg(msgNoLspClient));
    return;
  }
  var client = lspServer.lspClient;

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
      getMsg(msgRenameSymbol).replace("_OLD_SYMBOL_", oldName),
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

async function restartServer() {
  if (lspServer) {
    await lspServer.restart();
  }
}

class ClangDLanguageServer extends Disposable {
  constructor() {
    super();
    this.lspClient = null;
  }

  deactivate() {
    this.dispose();
  }

  async didStop(error) {
    if (error) {
      showError(getMsg(msgLspStoppedErr));
      console.error("Language server stopped with error:", error.message);
    }
  }

  async start() {
    if (this.lspClient) {
      await this.dispose();
      nova.subscriptions.remove(this.lspClient);
      this.lspClient = null;
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

    let path = nova.config.get(cfgLspPath);
    let args = [];
    let server = "";

    // Use the default server path
    if (!path) {
      return; // no path
    }

    switch (flavor) {
      case flavorApple:
        args = ["--compile-commands-dir=" + CCPath];
        path = path ?? "/usr/bin/clangd";
        server = "clangd";
        break;
      case flavorLLVM:
        args = ["--compile-commands-dir=" + CCPath, "--log=verbose"];
        path = path ?? "/usr/local/bin/clangd";
        server = "clangd";
        break;
      case flavorCCLS:
        args = [
          '--init={ "compilationDatabaseDirectory": "' + CCPath + '" }',
          "--print-all-options",
        ];
        path = path ?? "/usr/local/bin/ccls";
        server = "ccls";
        break;
      default:
        console.error("Unknown LSP flavor. Please submit a bug report.");
        return;
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

    try {
      this.lspClient = new LanguageClient(
        server,
        "C-Dragon Language Server",
        serverOptions,
        clientOptions
      );

      this.didStopDispose = this.lspClient.onDidStop(this.didStop);

      // Start the client
      this.lspClient.start();

      nova.subscriptions.add(this);
    } catch (err) {
      showNotice(getMsg(msgLspDidNotStart), "");
      console.error(err);
    }
  }

  async restart() {
    let onStop = this.lspClient?.onDidStop(() => {
      this.start();
      onStop?.dispose();
      console.log("Language server restarted");
      showNotice(getMsg(msgLspRestarted), "");
    });

    await this.dispose();
  }

  async dispose() {
    if (this.didStopDispose) {
      this.didStopDispose.dispose();
      this.didStopDispose = null;
    }
    if (this.lspClient) {
      this.lspClient.stop();
      this.lspClient = null;
    }
  }
}
