const fs = require('fs');
const path = require('path');

const originalSymlink = fs.symlink;
const originalSymlinkSync = fs.symlinkSync;

function resolveTarget(target, linkPath) {
    return path.isAbsolute(target) ? target : path.resolve(path.dirname(linkPath), target);
}

function junctionFallback(target, linkPath) {
    const resolvedTarget = resolveTarget(target, linkPath);
    if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isDirectory()) {
        return false;
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
    originalSymlinkSync.call(fs, resolvedTarget, linkPath, 'junction');
    return true;
}

function copyFallback(target, linkPath) {
    const resolvedTarget = resolveTarget(target, linkPath);
    fs.rmSync(linkPath, { recursive: true, force: true });
    fs.cpSync(resolvedTarget, linkPath, { recursive: true, force: true, dereference: true });
}

fs.symlink = function patchedSymlink(target, linkPath, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = undefined;
    }

    return originalSymlink.call(fs, target, linkPath, type, async (error) => {
        if (!error) return callback(null);
        if (error.code !== 'EPERM' && error.code !== 'EACCES') return callback(error);

        try {
            if (!junctionFallback(target, linkPath)) {
                copyFallback(target, linkPath);
            }
            callback(null);
        } catch (fallbackError) {
            callback(fallbackError);
        }
    });
};

fs.symlinkSync = function patchedSymlinkSync(target, linkPath, type) {
    try {
        return originalSymlinkSync.call(fs, target, linkPath, type);
    } catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
        if (!junctionFallback(target, linkPath)) {
            copyFallback(target, linkPath);
        }
        return undefined;
    }
};

const firebaseCliPath = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

process.argv = [
    process.argv[0],
    firebaseCliPath,
    ...process.argv.slice(2)
];

require(firebaseCliPath);
