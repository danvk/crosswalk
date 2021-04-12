# Changelog

## 1.4

- Type validation for query parameters [#19](https://github.com/danvk/crosswalk/issues/19).
  Thanks to @CarterGrimmeisen for the contribution!
- Security update for `y18n` [#20](https://github.com/danvk/crosswalk/pull/20)
- Add an option for a custom 400 Invalid Request handler [#19](https://github.com/danvk/crosswalk/pull/19)
- Add `--noExtraProps` to README with some explanatory Q&A.

## 1.3

- Support more complex inline types in handlers, e.g. `Endpoint<{user: User|null}, User>`.
  This also adds support for intersection types.
  See <https://github.com/danvk/crosswalk/issues/10>

## 1.2.2

- Suppress invalid HTTP Errors <https://github.com/danvk/crosswalk/issues/6>

## 1.2

- Add wrappers for all HTTP verbs (`router.post`, `router.patch`, etc.) <https://github.com/danvk/crosswalk/pull/2>

## 1.1

- Add support for readonly request bodies <https://github.com/danvk/crosswalk/pull/1>

## 1.0

- Initial release
