"""Explicitly gated Apify collection. Never incur Actor usage by default."""
import json,os
from pathlib import Path
Path('output').mkdir(exist_ok=True)
enabled=os.getenv('APIFY_RUN_ENABLED','false').lower()=='true'
status={'enabled':enabled,'actor_runs_started':0}
if enabled:
    status['blocked']='Actor input, local sources, usage cap and explicit spend authorization require configuration'
else:
    status['status']='disabled_no_usage'
Path('output/apify_run_status.json').write_text(json.dumps(status,indent=2),encoding='utf-8')
print('APIFY_RUN '+json.dumps(status))
