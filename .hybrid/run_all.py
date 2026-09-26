"""Invoked by the existing Windows task; no duplicate schedule."""
import json,pathlib,subprocess,sys
state=pathlib.Path(__file__).resolve().parent.parent
result=subprocess.run([sys.executable,str(state/'toolkit/auto_backup.py'),'run']).returncode
registry=state/'hybrid-projects.json'
entries=json.loads(registry.read_text()) if registry.exists() else {}
for project,item in entries.items():
    if not pathlib.Path(item['root']).is_dir():
        print(json.dumps({'hybrid_project':project,'ok':False,'reason':'registered folder missing'}));result=1;continue
    child=subprocess.run([sys.executable,item['tool'],'backup','--project',project,'--root',item['root']])
    if child.returncode:result=1
sys.exit(result)
