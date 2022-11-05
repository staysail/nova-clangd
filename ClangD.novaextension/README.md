# ClangD Language Server - C/C++

---

> This extension is _BETA_ release level quality.

> _NOTE_: We may chose to rename this extension in the future to reflect extended
> capabilities beyond just ClangD. We are also considering enabling the use
> of `ccls` as an alternative language server for people who want it.

This extension is forked from [Ben Beshara][1]'s original [C++ ClangD extension][2],
but has been extended significantly beyond that.

The purpose is to integrate with new capabilities, and to add features such as support for automatic formatting ala `clang-format.

Syntax support is provided via the official [Tree-sitter][3] grammars for C and C++, along
with queries we have supplied for this extension. These provide for syntax highlighting
and folding. This highlighting should be both richer, and faster, than previous alternatives.
It does require Nova version 10 or newer though.

Some limited assistance for automatic indentation of blocks is provided
for as well.

Formatting is done via `clangd`, and will respect the `.clang-format` in your
project directory if it is present.

If you have installed our [C][4] extension, you can uninstall it, as this module
provides a superset of that functionality.

## Requirements

> _TIP_: Apple supplies `clangd` with the Xcode developer tools. That's all you need.

In order to use this extension, you need to supply a version of `clangd` - its path can be specified in the global settings pane for this extension if required.

For most users on modern versions of macOS, you can just use the Apple supplied clangd,
which is located in `/usr/bin/clangd`.

It is possible to install an LLVM version of clangd using

```
# brew install llvm
```

or you can build it from scratch and place it where you like.

## Usage

The plugin will start when editing a C or C++ source file. In order to provide project-context specific information, your project will need to provide a `compile_commands.json` file - CMake can generate one for you by passing the `CMAKE_EXPORT_COMPILE_COMMANDS` variable when generating your project. More information can be found at https://clang.llvm.org/docs/JSONCompilationDatabase.html

The directory where your `compile_commands.json` file is stored can be specified in global or project preferences, if it is not in the root of the project directory

## Configuration

To configure global preferences, open **Extensions → Extension Library...** then select C++'s **Preferences** tab.

You can also configure preferences on a per-project basis in **Project → Project Settings...**

## Future Directions

There are some additional features we might like to offer
tuning for, such as default flags for compile_commands, or possibly generating them,
support for configuration of clang-format options, and such.

This extension will probably be renamed in the future (before it is 1.0).

[1]: https://benbeshara.id.au/ "Ben Beshara"
[2]: https://example.com/clangd-nova-extension
[3]: https://tree-sitter.github.io/tree-sitter/ "Tree-sitter web site"
[4]: https://github.com/staysail/nova-c "Tree-sitter grammar for C"
