# Third-party notices

OpenPDF Studio is licensed under AGPL-3.0-only. See LICENSE. The unmodified upstream dependencies retain their own licenses and notices.

| Dependency | License | Source |
| --- | --- | --- |
| MuPDF.js / MuPDF WebAssembly | AGPL-3.0-or-later | https://github.com/ArtifexSoftware/mupdf.js |
| PDF.js | Apache-2.0 | https://github.com/mozilla/pdf.js |
| Electron | MIT, with Chromium and third-party notices in the app distribution | https://github.com/electron/electron |
| React | MIT | https://github.com/facebook/react |
| Zustand | MIT | https://github.com/pmndrs/zustand |
| Lucide icons | ISC | https://github.com/lucide-icons/lucide |
| Tailwind CSS | MIT | https://github.com/tailwindlabs/tailwindcss |

The text-layer positioning rules in src/styles.css are adapted from Mozilla PDF.js, copyright Mozilla Foundation and contributors, Apache-2.0. The PDF rendering assets include their upstream license files. MuPDF's fonts and other components retain the notices shipped in its upstream source. Full dependency versions are pinned in package-lock.json. Electron's bundled LICENSE and LICENSES.chromium.html are retained by the packager.

Sources for this application are in this repository. When distributing binaries publicly, distribute the matching application source, package-lock.json, build scripts, and required corresponding sources/notices for copyleft dependencies. Public distribution and legal compliance review are not performed by this local build.

Upstream licensing references:
- https://mupdf.com/releases
- https://github.com/ArtifexSoftware/mupdf.js
- https://github.com/mozilla/pdf.js/blob/master/LICENSE
