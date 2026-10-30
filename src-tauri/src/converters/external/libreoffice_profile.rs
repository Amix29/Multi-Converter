use crate::converters::Result;
use std::{fs, path::Path};

// Private, per-conversion profile; never change the user's LibreOffice settings.
// Writer uses UNO LinkUpdateModes::NEVER = 0; Calc uses ScLkUpdMode::LM_NEVER = 1.
const SETTINGS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
 <item oor:path="/org.openoffice.Office.Common/Security/Scripting">
  <prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>
  <prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>
 </item>
 <item oor:path="/org.openoffice.Office.Writer/Content/Update">
  <prop oor:name="Link" oor:op="fuse"><value>0</value></prop>
 </item>
 <item oor:path="/org.openoffice.Office.WriterWeb/Content/Update">
  <prop oor:name="Link" oor:op="fuse"><value>0</value></prop>
 </item>
 <item oor:path="/org.openoffice.Office.Calc/Content/Update">
  <prop oor:name="Link" oor:op="fuse"><value>1</value></prop>
 </item>
 <item oor:path="/org.openoffice.Office.Update/Update">
  <prop oor:name="Enabled" oor:op="fuse"><value>false</value></prop>
 </item>
</oor:items>
"#;

pub(super) fn prepare(profile: &Path) -> Result<()> {
    let user = profile.join("user");
    fs::create_dir_all(&user)?;
    fs::write(user.join("registrymodifications.xcu"), SETTINGS)?;
    Ok(())
}
