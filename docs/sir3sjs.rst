SIR 3S MX in JS
===============

Sandbox to learn JavaScript by using JavaScript in a SIR 3S context.
To use sir3sjs, access to SIR 3S models and a licensed SIR 3S version are necessary.

sir3sjs represents a non-binding, arbitrary work in progress provided without any warranty.

`SIR 3S Toolkit <https://3sconsult.github.io/sir3stoolkit/>`_
provides ways to load and process SIR 3S result data in Python - as pandas data frames - from SIR 3S's own MX format.
In this play project, an attempt is made to load and process MX in JavaScript as well - as polars data frames.

Publishing to JSR
------------------

The ``sir3sjs`` package is published under the name
`@pnh/sir3sjs <https://jsr.io/@pnh/sir3sjs>`_
on `JSR <https://jsr.io/>`_

Configuration
~~~~~~~~~~~~~

Name, version, and the public entry point are maintained exclusively
in ``deno.json``:

.. code-block:: json

   {
     "name": "@pnh/sir3sjs",
     "version": "0.1.0",
     "exports": "./sir3sjs/mx.ts",
     "license": "MIT"
   }

``publish.include`` additionally determines which files actually
become part of the published package:

.. code-block:: json

   "publish": {
     "include": ["sir3sjs/mx.ts", "deno.json"]
   }

Publishing workflow
~~~~~~~~~~~~~~~~~~~~

1. **Bump the version** in ``deno.json``, e.g. from ``0.1.0`` to
   ``0.1.1``.
2. **Run a dry run** to catch lint, type, and "slow types" issues
   before publishing:

   .. code-block:: bash

      deno publish --dry-run

3. **Publish**:

   .. code-block:: bash

      deno publish

   The command uploads the files listed in ``publish.include`` and,
   the first time, opens a browser login to authorize against JSR
   via GitHub.
4. **Commit** the version change with a message following the
   pattern ``publish @pnh/sir3sjs@<version> to JSR``.

The package can then be imported in other Deno projects via
``jsr:@pnh/sir3sjs``, as is done in the ``imports`` section of this
project's own ``deno.json``:

.. code-block:: json

   "imports": {
     "@pnh/sir3sjs": "jsr:@pnh/sir3sjs@^0.1.0"
   }

There is currently no automated CI workflow for the JSR publish
(unlike the documentation publish via
``.github/workflows/docspublish.yml``) — the process is carried out
manually via the Deno CLI.
