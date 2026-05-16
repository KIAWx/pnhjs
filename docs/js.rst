JavaScript Getting Started
==========================


Resources
---------

Includes Tutorials for ES6, React, ... and also Typescript:

`JavaScript Tutorial <https://javascripttutorial.net/>`_

Maybe an alternative to the above:

`The Modern JavaScript Tutorial <https://javascript.info/>`_

Microsoft's official documentation for TypeScript:

`TypeScript Handbook <https://www.typescriptlang.org/docs/handbook/intro.html>`_

`Polars <https://pola-rs.github.io/nodejs-polars/>`_

ES Modules
----------

ES Modules are a standardized module system in JavaScript
that allows you to organize and reuse code across different files.
They were introduced in ES6 (ECMAScript 2015) and are now the modern default.

ES Modules are supported in runtimes like Deno and web browsers. You can import modules using the `import` statement, 
and you can specify the module source as a URL or a local file path:

.. code-block:: javascript

   import pl from 'nodejs-polars';

Adding the `type="module"` attribute to a `<script>` tag

.. code-block:: html
    
   <script type="module">

tells the browser to treat the script as an ES module,
allowing you to use `import` and `export` statements within the script.



