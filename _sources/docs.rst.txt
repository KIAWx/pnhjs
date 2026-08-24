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
     conf.py        Sphinx configuration (project, theme, extensions)
     index.rst      landing page and toctree
     docs.rst       this page
     ... other .rst files for the various pages
     make.bat       build entry point (Windows)
     _build/html/   generated site

A new page is added by creating a ``<name>.rst`` file and listing
``<name>`` in the ``toctree`` of ``index.rst``.

Building locally
----------------

The site is generated locally — on Windows:

.. code-block:: bat

   cd docs
   .\make.bat html

Sphinx writes the result to ``docs/_build/html``; ``index.html`` in that
folder can be opened directly in a browser to preview the site before
pushing.

Publishing to GitHub Pages
--------------------------

Publishing is automated by the GitHub Actions workflow
``.github/workflows/docspublish.yml``:

.. code-block:: yaml

   name: Publish already generated Sphinx Docs to GitHub Pages

   on:
     push:
       branches: [main]

   permissions:
     contents: write

   jobs:
     deploy:
       runs-on: windows-latest

       steps:
         - name: Checkout repo
           uses: actions/checkout@v4

         - name: Deploy to GitHub Pages
           uses: peaceiris/actions-gh-pages@v4
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./docs/_build/html
             publish_branch: gh-pages

What happens on every push to ``main``:

1. The workflow is triggered by the ``push`` event on the ``main``
   branch.
2. ``actions/checkout@v4`` checks out the repository, including the
   generated HTML in ``docs/_build/html``.
3. ``peaceiris/actions-gh-pages@v4`` takes the contents of
   ``publish_dir`` and force-pushes them to the ``gh-pages`` branch,
   authenticated with the automatically provided ``GITHUB_TOKEN``.
   ``permissions: contents: write`` is what allows that push.
4. Since Jekyll processing is not enabled, the action also writes a
   ``.nojekyll`` marker. This is essential for Sphinx output, because
   GitHub Pages would otherwise ignore the ``_static`` and ``_sources``
   directories whose names start with an underscore.
5. GitHub Pages serves the ``gh-pages`` branch at
   https://kiawx.github.io/pnhjs/.

**Sphinx itself does not run in CI.** As the workflow name states, it
publishes *already generated* docs. The build output in
``docs/_build/html`` is therefore committed to the repository and must
be rebuilt locally before pushing — otherwise a source change is pushed
while the published site still shows the previous state.

Typical workflow
----------------

1. **Edit** or add the relevant ``.rst`` file in ``docs``.
2. **Build** locally with ``.\make.bat html`` and check the result in
   ``docs/_build/html/index.html``.
3. **Commit** both the sources and the regenerated output under
   ``docs/_build/html``.
4. **Push** to ``main``.
5. The workflow deploys to ``gh-pages``; the updated page is live at
   https://kiawx.github.io/pnhjs/ shortly afterwards. The run can be
   followed in the *Actions* tab of the repository.

Notes
-----

* The theme is ``alabaster``, and ``extensions`` in ``conf.py`` is
  currently empty — the documentation is hand-written, no API reference
  is generated from the TypeScript sources.
* The publish of the ``@pnh/sir3sjs`` package to JSR is *not* automated
  and is carried out manually via the Deno CLI, see
  :doc:`sir3sjs`.
