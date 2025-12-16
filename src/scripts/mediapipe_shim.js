// Shim to provide locateFile hooks for MediaPipe packed assets loader inside the Chrome extension
// This ensures the loader can resolve local extension URLs via chrome.runtime.getURL
(function () {
    try {
        if (typeof window === 'undefined') return;

        // Ensure a global Module object exists — many Emscripten outputs reference Module or expect defaults
        window.Module = window.Module || {};

        const base = chrome.runtime.getURL('dist/node_modules/@mediapipe/face_mesh/');

        // Global flag consumers can check to prefer non-SIMD assets
        window.__MEDIAPIPE_FORCE_NON_SIMD = true;

        function enhanceModule(Module) {
            Module = Module || {};
            // Provide legacy and current argument fields
            if (!('arguments' in Module)) Module.arguments = Module.arguments_ || [];
            if (!('arguments_' in Module)) Module.arguments_ = Module.arguments || [];

            // Provide simple print handlers
            if (!Module.print) Module.print = function () { console.log.apply(console, arguments); };
            if (!Module.printErr) Module.printErr = function () { console.error.apply(console, arguments); };

            // Provide a locateFile default that points to the extension-local mediapipe dist path
            if (!Module.locateFile) Module.locateFile = function (file) {
                // Normalize file name and force non-SIMD variants when requested
                if (!file) return base + file;
                // If global flag is set or the requested filename contains 'simd', prefer non-SIMD file names
                if (window.__MEDIAPIPE_FORCE_NON_SIMD || file.indexOf('simd') !== -1) {
                    file = file.replace(/solution_simd_wasm_bin/g, 'solution_wasm_bin');
                    file = file.replace(/face_mesh_solution_simd_wasm_bin/g, 'face_mesh_solution_wasm_bin');
                }
                // Ensure we only return extension-local absolute URLs
                return base + file;
            };

            // Provide a no-op quit handler
            if (!Module.quit) Module.quit = function (status, err) { console.warn('Module.quit called', status, err); };

            // Provide wasmBinary placeholder — real binary will be loaded via locateFile
            if (!('wasmBinary' in Module)) Module.wasmBinary = undefined;

            return Module;
        }

        // The packed assets loader expects a Module-like object named createMediapipeSolutionsPackedAssets
        const packedModule = enhanceModule({});
        // Provide a conservative files list that prefers non-SIMD assets
        packedModule.files = [
            { url: 'face_mesh_solution_packed_assets_loader.js' },
            { simd: false, url: 'face_mesh_solution_wasm_bin.js' },
            { simd: false, url: 'face_mesh_solution_wasm_bin.wasm' }
        ];
        // Provide a hook that the packed_assets_loader will read as Module
        window.createMediapipeSolutionsPackedAssets = packedModule;

        // createMediapipeSolutionsWasm is expected to be a function that returns a Module for the wasm loader
        window.createMediapipeSolutionsWasm = function (Module) {
            // Module may be the packedModule or user-provided; enhance whichever is passed
            return enhanceModule(Module || {});
        };

        console.log('mediapipe_shim: initialized Module shims and createMediapipeSolutions* globals');
        // Diagnostic check: attempt to fetch each MediaPipe asset via chrome.runtime.getURL and log status
        (async function diagnosticFetchAssets() {
            try {
                const files = [
                    'face_mesh.js',
                    'face_mesh_solution_packed_assets.data',
                    'face_mesh_solution_packed_assets_loader.js',
                    'face_mesh_solution_simd_wasm_bin.js',
                    'face_mesh_solution_simd_wasm_bin.wasm',
                    'face_mesh_solution_wasm_bin.js',
                    'face_mesh_solution_wasm_bin.wasm'
                ];
                for (const f of files) {
                    const url = chrome.runtime.getURL('dist/node_modules/@mediapipe/face_mesh/' + f);
                    try {
                        const res = await fetch(url, { method: 'GET' });
                        console.log('mediapipe_shim: prefetch', f, '=>', url, 'status', res.status);
                    } catch (err) {
                        console.error('mediapipe_shim: prefetch FAILED', f, '=>', url, err);
                    }
                }
            } catch (err) {
                console.warn('mediapipe_shim: diagnostic fetches failed', err);
            }
        })();
    } catch (err) {
        console.warn('mediapipe_shim: failed to initialize shim', err);
    }
})();
