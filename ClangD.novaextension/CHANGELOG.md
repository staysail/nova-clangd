## Version 0.6

Added syntax support via Tree-sitter grammars for C and C++.
The C grammar and queries are lifted from our C extension, but the C++
grammar and and queries are new.

This also includes automatic detection of C vs C++ for header files based
on content expressions.

The C++ grammar does not include every possible C++ construct, because the
upstream Tree-sitter is missing some things. Additionally there is no
doubt opportunity to further improve on what is here, and contributions
from C++ gurus are welcome. (We don't normally work in C++ ourselves.)

As part of the Tree-sitter support, this includes support for folding,
and some simple support for automatic indentation. (Open blocks are now
recognized.)

## Version 0.5

Staysail release. This includes support automatic formatting, including
format on save.

## Version 0.1

I really have no idea what I'm doing but it's better than nothing... I think ¯\\\_(ツ)\_/¯