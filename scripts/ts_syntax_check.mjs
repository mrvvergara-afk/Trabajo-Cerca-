import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
for (const file of process.argv.slice(2)) {
  const code=fs.readFileSync(file,"utf8");
  try {
    const js=stripTypeScriptTypes(code,{mode:"transform"});
    new vm.SourceTextModule(js);
    console.log("TS_SYNTAX_OK "+file);
  } catch (error) {
    console.log("TS_SYNTAX_FAIL "+file+" :: "+String(error));
    process.exitCode=1;
  }
}