"""Offline verification; no network, SDK execution, data or deployment."""
import subprocess,hashlib,json,pathlib,xml.etree.ElementTree as ET
root=pathlib.Path(__file__).resolve().parents[2]
def git(*a):return subprocess.check_output(['git',*a],cwd=root,text=True)
base='b8c5027311004c0c1c9fbf7a5933c8c98171baa6'
changed=git('diff',base,'--name-only').splitlines()
protected=['backend/','shared/','public/sw.js','public/manifest.webmanifest','src/reading-history.ts','src/site-menu.tsx','src/territorial-radar.tsx','src/feed-inventory.ts','cron.json','package.json','package-lock.json']
prefix='integrations/appdeploy/house-ads/'
checks={'protected_files_unchanged':not any(x.startswith(prefix+p) for x in changed for p in protected),'only_feature_branch':git('branch','--show-current').strip()=='feature/redesign-stitch-2026-10','diff_check':subprocess.run(['git','diff',base,'--check'],cwd=root,capture_output=True).returncode==0}
for name in ['trabajo-cerca-horizontal.svg','trabajo-cerca-compact.svg','radar-territorial.svg']:
 p=root/prefix/'public/brand'/name;e=ET.fromstring(p.read_bytes());checks['inert_svg_'+name]=all(not x.tag.lower().endswith('script') and all(not k.lower().startswith('on') for k in x.attrib) for x in e.iter())
print(json.dumps({'passed':all(checks.values()),'checks':checks,'scope':'Source preservation, not browser equivalence'},indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
