/// Auto-start on boot functionality for Windows
/// Uses the Windows registry: HKCU\Software\Microsoft\Windows\CurrentVersion\Run

const REG_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APP_NAME: &str = "SuperClipboard3";

/// Check if auto-start is currently enabled
pub fn is_enabled() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey_with_flags(REG_KEY, KEY_READ) {
            Ok(key) => key.get_value::<String, _>(APP_NAME).is_ok(),
            Err(_) => false,
        }
    }

    #[cfg(not(windows))]
    {
        false
    }
}

/// Enable auto-start by adding a registry entry
pub fn enable() -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

        let exe_str = exe_path
            .to_str()
            .ok_or_else(|| "Failed to convert path to string".to_string())?;

        // Wrap path in quotes to handle spaces
        let value = format!("\"{}\"", exe_str);

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(REG_KEY)
            .map_err(|e| format!("Failed to open registry key: {}", e))?;

        key.set_value(APP_NAME, &value)
            .map_err(|e| format!("Failed to set registry value: {}", e))?;

        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Auto-start is only supported on Windows".to_string())
    }
}

/// Disable auto-start by removing the registry entry
pub fn disable() -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(REG_KEY, KEY_WRITE)
            .map_err(|e| format!("Failed to open registry key: {}", e))?;

        // Ignore error if value doesn't exist
        let _ = key.delete_value(APP_NAME);

        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Auto-start is only supported on Windows".to_string())
    }
}
