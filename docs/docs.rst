Documentation
=============

This documentation is written in reStructuredText, built with
`Sphinx <https://www.sphinx-doc.org/>`_ and published automatically to
GitHub Pages.

`pnhjs documentation <https://kiawx.github.io/pnhjs/index.html>`_

`SIR3SJS on JSR <https://jsr.io/@pnh/sir3sjs>`_

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
     make.bat          build entry point (Windows)
     _build/html/      local preview only, not in the repository

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

Why the generated HTML is not in the repository
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

It used to be. The workflow only deployed what it found, so every push
had to be preceded by a local ``make.bat html`` — and forgetting it did
not fail. The workflow ran, reported success, and published the previous
state. A silent staleness is worse than a broken build.

Building in CI removes the step that could be forgotten. As a
side effect the noise disappears too: a one-line change to a ``.rst``
file no longer drags a few hundred changed lines of generated HTML,
``searchindex.js`` and pickled doctrees through the diff.

``docs/_build/`` is therefore in ``.gitignore``.

The dependencies are pinned in ``docs/requirements.txt`` so that CI
produces the same pages as a local build. Alabaster is pinned alongside
Sphinx although it is only a dependency of it: it determines the
appearance and the shipped CSS, so a theme update alone could change the
output.

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

Notes
-----

* The theme is ``alabaster``, and ``extensions`` in ``conf.py`` is
  currently empty — the documentation is hand-written, no API reference
  is generated from the TypeScript sources.
* The build does not use ``-W``, so a Sphinx warning does not fail the
  deploy. Turning it on would catch broken references at the cost of a
  failed publish for every warning.
* The publish of the ``@pnh/sir3sjs`` package to JSR is *not* automated
  and is carried out manually via the Deno CLI, see
  :doc:`sir3sjs`.
