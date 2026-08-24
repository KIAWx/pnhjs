Documentation
=============

This documentation is written in reStructuredText, built with
`Sphinx <https://www.sphinx-doc.org/>`_ and published automatically to
GitHub Pages.

`pnhjs on GitHub Pages: https://kiawx.github.io/pnhjs <https://kiawx.github.io/pnhjs/index.html>`_

`SIR3SJS on JSR: https://jsr.io/@pnh/sir3sjs  <https://jsr.io/@pnh/sir3sjs>`_

Sources
-------

All documentation lives in the ``docs`` directory of the repository:

.. code-block:: text

   docs/
     conf.py           Sphinx configuration (project, theme, extensions)
     requirements.txt  pinned build dependencies
     index.rst         landing page and toctree
     docs.rst          this page
     ... other .rst files for the various pages

A new page is added by creating a ``<name>.rst`` file and listing
``<name>`` in the ``toctree`` of ``index.rst``.

Publishing to GitHub Pages
--------------------------

**Editing a source file and pushing is enough.** The workflow
``.github/workflows/docspublish.yml`` builds the documentation itself:

.. code-block:: yaml

   on:
     push:
       branches: [main]
     workflow_dispatch:

   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest

       steps:
         - uses: actions/checkout@v4

         - uses: actions/setup-python@v5
           with:
             python-version: "3.12"
             cache: pip
             cache-dependency-path: docs/requirements.txt

         - run: pip install -r docs/requirements.txt
         - run: sphinx-build -b html -d docs/_build/doctrees docs docs/_build/html

         - uses: peaceiris/actions-gh-pages@v4
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./docs/_build/html
             publish_branch: gh-pages

What happens on every push to ``main``:

1. The workflow is triggered by the ``push`` event on the ``main``
   branch. ``workflow_dispatch`` additionally allows a rebuild without a
   commit, from the *Actions* tab.
2. Python is set up and Sphinx installed from ``docs/requirements.txt``.
   The pip cache is keyed on that file, so an unchanged dependency set
   costs no download.
3. ``sphinx-build`` generates the site into ``docs/_build/html`` — inside
   the runner, not in the repository. ``-d`` puts the intermediate
   doctrees *beside* the site rather than inside it; by default they
   land in the output folder and would be published along with it, at
   290 KB more than the site itself weighs.
4. ``peaceiris/actions-gh-pages@v4`` force-pushes that folder to the
   ``gh-pages`` branch, authenticated with the automatically provided
   ``GITHUB_TOKEN``. ``permissions: contents: write`` is what allows the
   push.
5. Since Jekyll processing is not enabled, the action also writes a
   ``.nojekyll`` marker. This is essential for Sphinx output, because
   GitHub Pages would otherwise ignore the ``_static`` and ``_sources``
   directories whose names start with an underscore.
6. GitHub Pages serves the ``gh-pages`` branch at
   https://kiawx.github.io/pnhjs/.

Building locally
----------------

Only needed to preview before pushing — the published site does not
depend on it. On Windows:

.. code-block:: bat

   cd docs
   .\make.bat html

Sphinx writes the result to ``docs/_build/html``; ``index.html`` in that
folder can be opened directly in a browser. To reproduce exactly what CI
does, run the same command it does, from the repository root:

.. code-block:: bash

   sphinx-build -b html -d docs/_build/doctrees docs docs/_build/html

``make.bat`` looks for ``sphinx-build`` on the ``PATH``. If Sphinx lives
in an environment that is not on it, point the ``SPHINXBUILD``
environment variable at the executable.

Typical workflow
----------------

1. **Edit** or add the relevant ``.rst`` file in ``docs``.
2. **Preview** locally if wanted — optional.
3. **Commit** the source change and **push** to ``main``.
4. The workflow builds and deploys; the updated page is live at
   https://kiawx.github.io/pnhjs/ shortly afterwards. The run can be
   followed in the *Actions* tab of the repository.

API reference
-------------

The pages you are reading are hand-written. The **API reference** is
generated from the JSDoc comments in the TypeScript sources and lives
alongside them:

`API reference for sir3sjs <api/index.html>`_

It is produced by ``deno doc``, which reads TypeScript directly — no
extra toolchain, no second source of truth. Every exported symbol gets
its own page, with types, signatures and the surrounding prose from the
comment; the generated site brings its own search and a dark mode.

The workflow runs it after the Sphinx build, into the ``api``
subdirectory of the finished site:

.. code-block:: bash

   deno doc --html --name="sir3sjs" --output=docs/_build/html/api sir3sjs/mx.ts

Locally the same is available as a task:

.. code-block:: bash

   deno task docs:api

The order matters: Sphinx creates the output directory, ``deno doc``
writes into it afterwards.

Why ``deno doc`` and not a Sphinx extension
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Pulling TypeScript into Sphinx itself is possible — ``sphinx-js`` does
it via TypeDoc — but it means a Node toolchain, a TypeDoc version, and
an extension version that all have to keep agreeing with each other.
``deno doc`` ships with the runtime this project already uses and
understands its types natively. The price is that the reference is a
separate site rather than Sphinx pages, which for a link from one page
is a fair trade.

Completeness is checked
~~~~~~~~~~~~~~~~~~~~~~~

``deno doc --lint`` reports exported symbols without a JSDoc comment.
The workflow runs it before generating the reference, so an undocumented
export fails the build:

.. code-block:: bash

   deno doc --lint sir3sjs/mx.ts > doclint.txt 2>&1 || true
   if grep -A2 'error\[missing-jsdoc\]' doclint.txt \
      | grep -qE '^[[:space:]]*-->.*sir3sjs[/\\]mx\.ts'; then
     exit 1
   fi

Two details that are easy to get wrong: ``NO_COLOR=1`` is set for the
step, because Deno otherwise wraps the locations in ANSI sequences that
the pattern misses; and the path separator is left open, because Deno
reports paths in the notation of the operating system.

Why only ``missing-jsdoc``
^^^^^^^^^^^^^^^^^^^^^^^^^^

The lint also emits ten ``private-type-ref`` findings: every reader
returns a Polars ``DataFrame``, a type this module does not re-export.
Re-exporting it silences them — and pulls the entire type landscape of
``nodejs-polars`` into the generated reference, taking it from 67 pages
and 1.4 MB to 151 pages and 4.7 MB.

Returning Polars data frames is the point of the module, so the finding
is structural rather than a defect, and tripling the published site to
silence it is not a good trade. The check is therefore narrowed to the
part that catches real omissions.

Notes
-----

* The theme is ``alabaster`` and ``extensions`` in ``conf.py`` is empty —
  the prose pages need no Sphinx extension, and the API reference is
  generated separately, see above.
* The build uses ``-W --keep-going``: every Sphinx warning is an error,
  and all of them are shown rather than just the first. A broken
  cross-reference fails the deploy instead of quietly going live.
* The publish of the ``@pnh/sir3sjs`` package to JSR is *not* automated
  and is carried out manually via the Deno CLI, see
  :doc:`sir3sjs`.
