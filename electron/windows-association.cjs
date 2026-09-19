const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

async function queryRegistryValue(key, valueName) {
    const args = ["query", key, ...(valueName ? ["/v", valueName] : ["/ve"])];
    try {
        const { stdout } = await execFileAsync("reg.exe", args, { windowsHide: true });
        return stdout.match(/\bREG_(?:SZ|EXPAND_SZ)\s+([^\r\n]+)/i)?.[1].trim() || null;
    } catch (error) {
        // reg.exe returns 1 for an absent key/value. No association is normal.
        if (error.code === 1) return null;
        throw new Error("No se pudo comprobar la asociación de archivos de Windows.", { cause: error });
    }
}

async function hasKiCadFileAssociation(query = queryRegistryValue) {
    const userChoice = await query("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.kicad_pro\\UserChoice", "ProgId");
    const programId = userChoice || await query("HKCR\\.kicad_pro");
    if (!programId) return false;
    const command = await query(`HKCR\\${programId}\\shell\\open\\command`);
    return Boolean(command);
}

module.exports = { hasKiCadFileAssociation };
