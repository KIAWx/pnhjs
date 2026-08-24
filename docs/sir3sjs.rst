SIR 3S MX in JS
===============

Sandbox to learn JavaScript by using JavaScript in a SIR 3S context.
To use sir3sjs, access to SIR 3S models and a licensed SIR 3S version are necessary.

sir3sjs represents a non-binding, arbitrary work in progress provided without any warranty.

`SIR 3S Toolkit <https://3sconsult.github.io/sir3stoolkit/>`_
provides ways to load and process SIR 3S result data in Python - as pandas data frames - from SIR 3S's own MX format.
In this play project, an attempt is made to load and process MX in JavaScript as well - as polars data frames.

Loading a result
----------------

The primary entry point is the class ``MxResult``. One call reads a
whole MX result directory and returns an object holding every data
frame:

.. code-block:: typescript

   import { MxResult } from "./sir3sjs/mx.ts";

   const mxResult = await MxResult.fromDir("./WD/B1/V0/BZ1");
   console.log(mxResult.mxs.shape);

The instance holds one data frame per MX file:

.. list-table::
   :header-rows: 1
   :widths: 12 12 58

   * - Property
     - Source
     - Content
   * - ``mx1``
     - ``.mx1``
     - Channel definitions, one row per channel
   * - ``mx2``
     - ``.mx2``
     - Vector channel definitions, one row per vector channel
   * - ``mxs``
     - ``.mxs``
     - The data itself, one row per time step

Alongside these, ``files`` carries the paths the result was built from
and ``dir`` the directory it was read from. ``dpStrs`` returns the
datapoint columns of ``mxs`` without the derived ``Timestamp`` column,
and ``dps()`` the same as structured ``S3sDp`` objects.

The ``.xml`` SirCalc file is located and its path kept in ``files.xml``,
but not parsed yet.

Why ``fromDir`` and not ``new MxResult(dir)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Reading the files is asynchronous, and a JavaScript ``constructor``
cannot be ``async`` — it has to return the instance, not a promise of
one. Constructing first and loading afterwards would hand out a
half-built object in which every property access is a guess. The static
factory avoids that: once the ``await`` resolves, the instance is
complete. The constructor is therefore ``private``.

A second factory, ``MxResult.fromFiles(files, dir?)``, takes paths that
are already known — useful when the files do not share a directory, or
when a variant other than the one ``getMxFilesFromDir`` selects is
wanted.

Building blocks
~~~~~~~~~~~~~~~

``MxResult`` is built on top of the standalone functions, which remain
exported and usable on their own:

.. list-table::
   :header-rows: 1
   :widths: 32 50

   * - Function
     - Purpose
   * - ``getMxFilesFromDir(dir)``
     - Locate the four MX files in a directory
   * - ``readMx1(path)``
     - Channel definitions (XML) as a data frame
   * - ``readMx2(path)``
     - Vector channel definitions (binary) as a data frame
   * - ``readMxs(path, mx1Df)``
     - The result data (binary) as a data frame

Because ``readMxs`` needs the channel layout from MX1, ``fromFiles``
reads MX1 first; MX2 and MXS are then read in parallel.

Vector channels
---------------

A vector channel holds one value per object of its type: ``KNOT~T``
carries a temperature for all 11 143 nodes at once. MX2 supplies the
keys in the same order, so value *i* belongs to key *i*. Every object
type with vector channels has exactly one MX2 row for this, under the
attribute ``tk`` or ``pk``.

``mxs`` contains the scalar channels only. Vector channels are read per
object type, on demand — ``readVectors`` for one value per object,
``readVectorPoints`` for the RVEC channels with one value per point:

.. code-block:: typescript

   mxResult.vectorTypes;                       // ["FWES", "FWVB", …, "ROHR", …]
   const knot = await mxResult.readVectors("KNOT");
   knot.shape;                                 // { height: 579436, width: 30 }

The result is **long**: one row per time step and object, one column per
attribute, plus ``OBJTYPE``, ``OBJTYPE_PK`` and ``Timestamp``.

Why long and not one column per object
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Named the way a scalar channel is, the vector channels of this model
would expand to **592 300 columns** — ``KNOT`` alone accounts for
300 861 (27 channels × 11 143 nodes) and ``ROHR`` for 233 688. Measured
against Polars, building a frame that wide extrapolates to roughly a
minute and some five gigabytes, and the result would defeat every way of
looking at it: no display, no ``toRecords()``, a legend map with 592 300
entries.

Long is the shape a data frame is built for. The same ``KNOT`` data
becomes 579 436 rows × 30 columns and loads in about three seconds. The
datapoint of a single value stays reconstructible from ``OBJTYPE``,
``OBJTYPE_PK`` and the column name.

Reading is per type and on demand rather than up front, because
expanding every type at once means over 30 million values, most of which
a given analysis never touches.

RVEC: values along an object
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Where an ordinary vector channel carries one value per object, an RVEC
channel carries one per **point** of each object. In the reference model
the 11 128 pipes have between 2 and 136 points each, 42 514 in total,
and channels such as ``PVEC``, ``TVEC`` or ``SVEC`` hold exactly that
many values.

The values of all objects lie end to end in one block. MX2's
``N_OF_POINTS`` says how many belong to each, so the block is cut
accordingly — first pipe the first *n₀* values, next pipe the following
*n₁*, and so on. The counts must add up to the channel length; otherwise
the cut would be guesswork.

.. code-block:: typescript

   mxResult.vectorPointTypes;                        // ["ROHR"]
   const punkte = await mxResult.readVectorPoints("ROHR");
   punkte.shape;                                     // { height: 2210728, width: 13 }

One row per time step, object and point, with ``POINT`` counting from 0
along each object:

.. list-table::
   :header-rows: 1
   :widths: 22 60

   * - Column
     - Meaning
   * - ``OBJTYPE``
     - The object type, e.g. ``"ROHR"``
   * - ``OBJTYPE_PK``
     - Key of the object the point belongs to
   * - ``POINT``
     - Position along that object, starting at 0
   * - one per attribute
     - ``PVEC``, ``TVEC``, ``SVEC``, ``ZVEC`` …
   * - ``Timestamp``
     - If the file carries one

Since ``SVEC`` is the distance along the pipe and ``TVEC`` the
temperature there, one pipe in one time step gives a longitudinal
profile.

A note on the point counts: MX2's ``Data`` column holds vectors of
different types across its rows, and a data frame column has one type —
so the integer counts arrive as ``"4.0"`` rather than ``4``.
``vectorPointCounts`` converts them back.

What is still not read
~~~~~~~~~~~~~~~~~~~~~~

One group remains, reported through ``onSkip`` rather than read: 2
``RCPL_ROWT`` channels declaring 3 values while MX2 lists 5 keys.
Assigning them would be guesswork.

.. code-block:: typescript

   await mxResult.readVectors("ROHR", {
     onSkip: (s) => console.warn(`${s.objType}~${s.attrType}: ${s.reason}`),
   });

   // Or refuse to read at all when MX1 and MX2 disagree:
   await mxResult.readVectors("RCPL_ROWT", { strict: true });   // throws

``strict`` is off by default so that one inconsistent channel does not
cost the others — but nothing is ever dropped in silence: a skipped
channel always reaches ``onSkip``.

Which state a row describes
---------------------------

Every frame — ``mxs`` as well as both vector frames — opens with two
columns saying *which* state the row belongs to, before any measured
value:

.. list-table::
   :header-rows: 1
   :widths: 20 62

   * - Column
     - Meaning
   * - ``Timestamp``
     - The time of the record, parsed to ``Datetime("ms")``
   * - ``Snapshottype``
     - What kind of record it is

Both are derived from scalar channels and therefore describe the whole
record: in the vector frames every object — and every point — of a
record carries the same value.

``Snapshottype`` matters more than it looks. Not every record is a time
step; the reference model's 52 records are:

.. list-table::
   :header-rows: 1
   :widths: 14 12 56

   * - Value
     - Count
     - What it is
   * - ``TIME``
     - 49
     - An ordinary time step
   * - ``STAT``
     - 1
     - The steady-state calculation
   * - ``TMIN``
     - 1
     - Extreme values, minimum
   * - ``TMAX``
     - 1
     - Extreme values, maximum

Mixing those into a time series would put three records into it that are
not points in time at all, so a plot over time usually starts by
filtering:

.. code-block:: typescript

   mxResult.mxs.filter(pl.col("Snapshottype").isIn(["TIME"]));

The underlying channel stays available under its datapoint name — the
new column is an addition, not a replacement.

Datapoint identity
------------------

A datapoint — one channel of a result — is identified by six fields, and
that identity has a canonical string form in which the fields are joined
by ``~``:

.. code-block:: text

   OBJTYPE~NAME1~NAME2~NAME3~ATTRTYPE~OBJTYPE_PK

   KNOT~V-FHW-191~PH~4794189121752237861              only NAME1
   FWES~V-FHW-061~R-FHW-0612~TK~4958171736338468563   NAME1 and NAME2
   ALLG~TIMESTAMP~5108484491127470798                 no names at all

The object a value belongs to comes before the attribute being measured,
and **empty names are left out** rather than leaving ``~~`` behind.
Object type, attribute and key are always present.

That string form is what the MXS columns are named after, so both
directions are needed constantly. The class ``S3sDp`` owns both the
fields and the format:

.. code-block:: typescript

   const dp = S3sDp.fromString("KNOT~V-FHW-191~PH~4794189121752237861");
   dp.OBJTYPE;   // "KNOT"
   dp.ATTRTYPE;  // "PH"
   dp.label;     // "KNOT V-FHW-191 PH"
   `${dp}`;      // the original string again

Parsing by position
~~~~~~~~~~~~~~~~~~~

Because empty names are omitted, the number of parts varies and the
fields cannot be read off by index. Three positions are fixed instead:
the object type leads, the key closes, and the attribute sits just
before the key. Whatever lies between object type and attribute are the
names, in order.

This relies on names filling from the front — ``NAME2`` set while
``NAME1`` is empty could not be told apart from ``NAME1`` alone. In the
reference model all 215 channels follow that rule (101 carry ``NAME1``
only, 75 carry ``NAME1`` and ``NAME2``, 39 carry no name at all, with no
gaps in between), so the round trip holds for every column.

.. list-table::
   :header-rows: 1
   :widths: 30 52

   * - Member
     - Purpose
   * - ``S3sDp.fromString(dpStr)``
     - Parse the canonical string form
   * - ``S3sDp.fromMx1Row(row)``
     - Build a datapoint from an MX1 channel row
   * - ``toString()``
     - The canonical string form — the matching MXS column name
   * - ``label``
     - Short label for legends, e.g. ``"KNOT V-FHW-191 PH"``

``label`` puts the object type first, then the names, then the attribute
— what the value belongs to before what is being measured, which is how
one would name it out loud. Empty name parts are dropped rather than
left as gaps, so a datapoint carrying only ``NAME1`` reads
``"KNOT V-FHW-191 PH"`` while one that also has ``NAME2`` reads
``"FWES V-FHW-061 R-FHW-0612 TK"``.

Why a class and not loose functions
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Previously a type ``S3sDp`` and two functions ``makeDpStrFromMx1Row``
and ``makeDpFromDpStr`` sat side by side, and the format was written
down twice: once as a template literal that joined the fields in one
order, and once as a set of array indices that read them back — with
``OBJTYPE_PK`` at position 5 while the type listed it second. Nothing
tied the two together, so a change to one would silently break the
other.

Now the field order and the separator are declared once, module-private,
and both directions derive from them. Callers no longer need to know
either: they parse with ``fromString`` and serialise with ``toString``.
``label`` moved onto the class for the same reason — it is derived
purely from a datapoint's own fields, so that is where it belongs.

The same reasoning applies inside ``readMxs``. It used to build each
column name again for every single time step, which meant thousands of
repetitions of identical work and kept the decoding loop entangled with
a format it has no business knowing. The record layout — column name,
data type and byte range per channel — is now worked out once, before
the loop over the records.

What the MX module does not do
------------------------------

The module used to export a type ``ttEntry`` and two functions
``makettEntryFromDpStr`` and ``makettEntryRawFromDpStr``, which built
Vega-Lite tooltip descriptors. They described how data is *presented*,
not what it is — and one of them expected a label map that the module
neither defined nor owned.

They now live in ``plot.ts`` as ``TooltipEntry`` and ``tooltipEntries``:

.. code-block:: typescript

   import { tooltipEntries } from "./plot.ts";

   tooltipEntries(valueCols);                   // raw column names
   tooltipEntries(valueCols, col2LegendLabel);  // readable labels

The two former functions collapsed into one: whether a column is
relabelled is a parameter, not a separate function. A column the map
does not cover falls back to its own name, so an entry can no longer end
up ``undefined`` — which the old label-based variant could produce.

The direction of the dependency matters: presentation may depend on the
data model, but the data model must not depend on presentation. ``mx.ts``
knows nothing about Vega-Lite, and that is the point.

Character encoding
~~~~~~~~~~~~~~~~~~

SIR 3S writes its XML as ``Windows-1252``, declared in the file itself:

.. code-block:: xml

   <?xml version="1.0" encoding="Windows-1252"?>

``Deno.readTextFile`` always decodes as UTF-8, and in UTF-8 a byte such as
``0xE4`` — ``ä`` in Windows-1252 — is not a valid start byte, so it becomes
the replacement character ``U+FFFD``. Since object names travel from MX1
into the datapoint strings and from there into the MXS column names, every
umlaut would be destroyed before the XML parser ever saw it:
``WBLZ~WVB~WärmeblnzGes`` arrived as ``WBLZ~WVB~W?rmeblnzGes``.

``readMx1`` therefore reads the file as bytes and decodes it with the
encoding the declaration names, falling back to UTF-8 when there is no
declaration or the encoding is unknown. A byte-order mark takes precedence
over the declaration.

Fixed-length records and short reads
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

MX2 and MXS are binary formats made up of fixed-length records, which
have to be read in full before they can be decoded. ``Deno.FsFile.read``
may legitimately return fewer bytes than the buffer holds even when the
file has more to give — a single ``read`` call is therefore not enough.
This matters in practice: an MXS record can run into several megabytes,
which makes short reads likely rather than exotic. Both readers loop
until the record is complete and treat a genuinely short record as what
it is — a truncated file.

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
     "version": "0.2.0",
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

1. **Bump the version** in ``deno.json``. Below ``1.0.0`` the minor
   position carries new functionality and the patch position fixes, so
   adding ``MxResult`` moved the package from ``0.1.2`` to ``0.2.0``.
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
     "@pnh/sir3sjs": "jsr:@pnh/sir3sjs@^0.2.0"
   }

Note that this entry has to be raised *after* publishing, not with the
version bump: a range that no published version satisfies cannot be
resolved. Since ``^0.1.2`` means ``>=0.1.2 <0.2.0``, it will not pick up
``0.2.0`` on its own.

There is currently no automated CI workflow for the JSR publish
(unlike the documentation publish via
``.github/workflows/docspublish.yml``) — the process is carried out
manually via the Deno CLI.
