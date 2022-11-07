# C-Dragon - C/C++ Extension

---

_C-Dragon_ provides rich support for C and C++ development in Nova.

> This extension is a _BETA_ release.

> _NOTE_: An earlier version of this was named _ClangD_, but as the
> capabilities we have provided go beyond `clangd` and as we also now support `ccls`,
> we have changed the name of this extension to avoid possible confusion.

It is forked from, and originally based upon
[Ben Beshara][1]'s original [C++ ClangD extension][2],
but has been extended significantly beyond Ben's original work.

## Feature Status

| Status | Feature                         | Notes                                                     |
| ------ | ------------------------------- | --------------------------------------------------------- |
| ✅     | C Support                       |                                                           |
| ✅     | C++ Support                     |                                                           |
| ✅     | Highlighting                    | Uses Tree-sitter (fast!)                                  |
| ✅     | Code folding                    | Collapse functions, classes, structs, blocks, etc.        |
| ✅     | Jump to definition              |                                                           |
| ✅     | Hover                           | Relevant documentation when you hover over a symbol.      |
| ✅     | Signature Assistance            | Get parameter hints as you type.                          |
| ✅     | Diagnostic Assistance           | Report issues, and in some cases suggestsions, with code. |
| ✅     | Formatting                      | Respects `.clang-format`                                  |
| ✅     | Format on Save                  |                                                           |
| ☑️     | Code Actions                    | Suggested fix. Limited at present.                        |
| ☑️     | Rename Symbol                   | Various caveats.                                          |
| ⛔️    | Format Selection                | Coming soon.                                              |
| ⛔️    | Sort Includes                   | May depend on LSP                                         |
| ⛔️    | Find References                 | Coming soon.                                              |
| ⛔️    | Inlay Hints                     | (Does Nova support this?)                                 |
| ⛔️    | Project Format Configuration    | (Supported via `.clang-format`)                           |
| ⛔️    | Language Server Restart         | Coming soon.                                              |
| ⛔️    | Language Server Diagnostic Info | Coming soon.                                              |
| ⛔️    | Clang-Tidy Support              | Richer advice, only via `clangd`                          |
| ✅     | `clangd` Support                |                                                           |
| ✅     | `ccls` Support                  |                                                           |

_Legend:_
✅ Implemented, and works well.
☑️ Partial implementation.
⛔️ Not implemented

## Details

Syntax support is provided via the official [Tree-sitter][3] grammars for C and C++, along
with queries we have supplied for this extension. These provide for syntax highlighting
and folding. This highlighting should be both richer, and faster, than previous alternatives.
It does require Nova version 10 or newer though.

Some limited assistance for automatic indentation of blocks is provided
for as well.

Formatting will respect the `.clang-format` in your
project directory if it is present.

If you have installed our [C][4] extension, you can uninstall it, as this module
provides a superset of that functionality.

You can also uninstall any other C or C++ language server or syntax plugins,
as this should be a functional superset of all of them.

## Requirements

> _TIP_: Apple supplies `clangd` with the Xcode developer tools. That's all you need.
> For that use case, this should Just Work<sup>&trade;</sup>.

### Xcode (Apple) ClangD

This extension works well with the out of the box Apple version of `clangd`.
You should install a Xcode via the App Store, as that also includes headers
and other features useful for software development on a mac.

### LLVM ClangD

If you choose to use LLVM `clangd` you can install it using [Homebrew][5]:

```
# brew install llvm
```

Note that `brew` installs LLVM in "`keg-only`" mode, so you will typically
find the path to `clangd` in either `/opt/homebrew/opt/llvm/bin` (Apple Silicon)
or `/usr/local/opt/llvm/bin` (Intel).

or you can build it from scratch and place it where you like.

### CCLS

The `ccls` language server can be installed via brew, but note that
it may require some tinkering to get it to work:

```
# brew install ccls
```

We recommend building `ccls` from scratch if you decide to go this route.

As with LLVM, you will need to provide the path to the binary.
If you use `brew`, it will be in `/opt/homebrew/bin/ccls` (Apple Silicon)
or `/usr/local/bin/ccls` (Intel).

## Usage

The extension will start when editing a C or C++ source file. In order to provide project-context specific information, your project will need to provide a `compile_commands.json` file - tools like CMake, meson-build, and similar can generate one for you. More information can be found at https://clang.llvm.org/docs/JSONCompilationDatabase.html

The directory where your `compile_commands.json` file is stored can be specified in global or project preferences, if it is not in the root of the project directory. (Note that `clangd` will also search in a top-level directory called `build`, but `ccls` will not.)

## Configuration

To configure global preferences, open **Extensions → Extension Library...** then select C-Dragon's **Preferences** tab.

You can also configure preferences on a per-project basis in **Project → Project Settings...**

For convenience, access to configuration is also available via the **C-Dragon** menu item in the
editor's right click menu (when working on a C or C++ file).

## Other Recommended Extensions

It is recommended to enable support for one of CMake, Meson, or Makefile parsing,
assuming your project uses one of these to drive it's build.
Staysail has published extensions for the former two.

## Bugs

- Symbol renames won't work if the symbol starts in columns 0 or 1, or is located
  on the first two lines of the file. This may be a defect in Nova.
- Symbol renames can mess up highlighting. Make a subsequent change to refresh the
  tree-sitter grammar's view of things.
- ClangD (and probably CCLS) has various limitations around symbol renaming. YMMV.
- Some things that should be code actions are not.

[1]: https://benbeshara.id.au/ "Ben Beshara"
[2]: https://example.com/clangd-nova-extension
[3]: https://tree-sitter.github.io/tree-sitter/ "Tree-sitter web site"
[4]: https://github.com/staysail/nova-c "Tree-sitter grammar for C"
[5]: https://brew.sh "Homebrew package manager"
