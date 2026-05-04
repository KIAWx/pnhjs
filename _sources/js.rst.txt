JavaScript Getting Started
==========================


Resources
---------

`The Modern JavaScript Tutorial <https://javascript.info/>`_

`JavaScript Tutorial <https://javascripttutorial.net/>`_

ES Modules
----------

ES Modules are a standardized module system in JavaScript
that allows you to organize and reuse code across different files.
They were introduced in ES6 (ECMAScript 2015) and are now the modern default.

ES Modules are supported in runtimes like Deno and web browsers. You can import modules using the `import` statement, 
and you can specify the module source as a URL or a local file path:

.. code-block:: javascript

   import { html } from "https://deno.land/x/display/mod.ts";

Adding the `type="module"` attribute to a `<script>` tag

.. code-block:: html
    
   <script type="module">

tells the browser to treat the script as an ES module,
allowing you to use `import` and `export` statements within the script.




