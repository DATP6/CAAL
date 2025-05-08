import { defineConfig, Plugin } from 'vitest/config';

// Horrible evil hack that allows us to import multiset.ts as a module even though it doesn't export one
// We can't just export a module because tsc expects everything to be a flat file
const transformReexport = (): Plugin => {
    return {
        name: 'caal-reexport-multiset',
        transform(code, id) {
            if (!/multiset(\.(ts|js))?$/.test(id)) {
                return null;
            }
            return `export ${code};`;
        }
    };
};

export default defineConfig({
    plugins: [transformReexport()]
});
