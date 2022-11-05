# Clang (C/C++) Language Server for Nova

---

This extension is forked from [Ben Beshara][1]'s original [C++ ClangD extension][2].

The purpose is to integrate with new capabilities, and to add features such as support for automatic formatting.

This will likely best be paired with a syntax highlighting extension. If you are working with C, we would would recommend our [C extension][3] for that.

Hopefully a C++ Tree-Sitter grammar will be created as well.

## Requirements

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

We will likely merge the C and C++ tree-sitter grammars, to provide an all-in one
plugin for C developers. There are some additional features we might like to offer
tuning for, such as default flags for compile_commands, or possibly generating them,
support for configuration of clang-format options, and such.

[1]: https://benbeshara.id.au/ "Ben Beshara"
[2]: https://example.com/clangd-nova-extension
[3]: https://github.com/staysail/nova-c "Tree-sitter grammar for C"
