"""Portable Git recovery metadata, stored only inside encrypted Drive snapshots."""
import json,pathlib,tempfile,os
PREFIX='.backup-history/'

def state(a,root):
    refs=a.git(root,'for-each-ref','--format=%(refname) %(objectname)').stdout.decode().splitlines()
    return {'head':a.git(root,'rev-parse','HEAD').stdout.decode().strip(),
        'symbolic_head':a.git(root,'symbolic-ref','-q','HEAD',check=False).stdout.decode().strip(),
        'refs':dict(x.split(' ',1) for x in refs),
        'reflog_commits':sorted(set(a.git(root,'reflog','show','--all','--format=%H').stdout.decode().splitlines())),
        'stashes':a.git(root,'reflog','show','--format=%H','refs/stash',check=False).stdout.decode().splitlines(),
        'branch_config':a.git(root,'config','--local','--get-regexp',r'^branch\..*\.(remote|merge)$',check=False).stdout.decode().splitlines(),
        'identity':{key:a.git(root,'config','--get',key,check=False).stdout.decode().strip() for key in ['user.name','user.email']}}

def capture(a,root):
    if a.git(root,'ls-files','--unmerged').stdout:raise RuntimeError('Resolve Git merge conflicts before recovery backup')
    if b'160000 ' in a.git(root,'ls-files','--stage').stdout:raise RuntimeError('Submodules require a separate backup registration')
    meta=state(a,root)
    patch=a.git(root,'diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv','HEAD','--').stdout
    meta['index_patch_sha256']=a.digest(patch)
    cache=a.STATE/'history-cache';cache.mkdir(exist_ok=True)
    signature=a.digest(a.canonical(meta));bundle=cache/(signature+'.bundle')
    if not bundle.exists():
        with tempfile.TemporaryDirectory(dir=cache) as td:
            temp=pathlib.Path(td)/'history.bundle'
            a.git(root,'bundle','create',str(temp),'--all','HEAD','--reflog')
            a.git(root,'bundle','verify',str(temp))
            os.replace(temp,bundle)
    data={PREFIX+'repository.bundle':bundle.read_bytes(),PREFIX+'metadata.json':a.canonical(meta),PREFIX+'index.patch':patch}
    exclude=a.git(root,'rev-parse','--git-path','info/exclude').stdout.decode().strip()
    p=pathlib.Path(exclude)
    if not p.is_absolute():p=root/p
    if p.exists():data[PREFIX+'exclude']=p.read_bytes()
    if state(a,root)!={k:v for k,v in meta.items() if k!='index_patch_sha256'}:raise RuntimeError('Git history changed during capture')
    if a.git(root,'diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv','HEAD','--').stdout!=patch:raise RuntimeError('Staging changed during capture')
    return data

def restore_repository(a,project,destination,record,fetch_github=True):
    root=pathlib.Path(destination).resolve();history=root/PREFIX
    meta=json.loads((history/'metadata.json').read_text())
    if (root/'.git').exists():raise RuntimeError('Refusing to replace an existing Git repository')
    url='https://github.com/aundots/'+project+'.git'
    staging=a.STATE/'staging';staging.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=staging) as td:
        bare=pathlib.Path(td)/'repository.git';a.git(None,'init','--bare',str(bare))
        args=['--git-dir='+str(bare)]
        if fetch_github:
            if not record.get('code_sha'):raise RuntimeError('Snapshot has no verified GitHub code commit')
            a.git(None,*args,'fetch','--no-tags',url,record['code_sha'])
            assert a.git(None,*args,'rev-parse','FETCH_HEAD').stdout.decode().strip()==record['code_sha']
        a.git(None,*args,'bundle','verify',str(history/'repository.bundle'))
        a.git(None,*args,'bundle','unbundle',str(history/'repository.bundle'))
        for ref,sha in meta['refs'].items():
            if not ref.startswith('refs/'):raise RuntimeError('Invalid saved ref')
            a.git(None,'check-ref-format',ref)
            a.git(None,*args,'update-ref',ref,sha)
        if meta['stashes']:
            a.git(None,*args,'update-ref','-d','refs/stash')
            for sha in reversed(meta['stashes']):a.git(None,*args,'update-ref','--create-reflog','-m','Recovered stash','refs/stash',sha)
        for sha in meta['reflog_commits']:a.git(None,*args,'update-ref','refs/recovery/reflog/'+sha,sha)
        if meta['symbolic_head']:a.git(None,*args,'symbolic-ref','HEAD',meta['symbolic_head'])
        else:a.git(None,*args,'update-ref','--no-deref','HEAD',meta['head'])
        a.git(None,*args,'config','core.bare','false')
        a.git(None,*args,'config','core.autocrlf','true')
        a.git(None,*args,'config','remote.origin.url',url)
        a.git(None,*args,'config','remote.origin.fetch','+refs/heads/*:refs/remotes/origin/*')
        for line in meta.get('branch_config',[]):
            key,value=line.split(' ',1)
            if key.endswith('.remote') and value not in {'origin','.'}:continue
            if key.endswith('.merge') and not value.startswith('refs/heads/'):continue
            a.git(None,*args,'config',key,value)
        for key,value in meta.get('identity',{}).items():
            if key in {'user.name','user.email'} and value:a.git(None,*args,'config',key,value)
        a.git(None,*args,'fsck','--full','--no-reflogs')
        os.replace(bare,root/'.git')
    a.git(root,'read-tree',meta['head'])
    patch=history/'index.patch'
    if a.digest(patch.read_bytes())!=meta['index_patch_sha256']:raise RuntimeError('Index patch mismatch')
    if patch.stat().st_size:a.git(root,'apply','--cached','--binary','--whitespace=nowarn',str(patch))
    exclude=root/'.git/info/exclude';exclude.parent.mkdir(exist_ok=True)
    saved=(history/'exclude').read_bytes() if (history/'exclude').exists() else b''
    exclude.write_bytes(saved+b'\n/.backup-history/\n')
    assert a.git(root,'rev-parse','HEAD').stdout.decode().strip()==meta['head']
    assert a.git(root,'diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv','HEAD','--').stdout==patch.read_bytes()
    return {'head':meta['head'],'refs_restored':len(meta['refs']),'stash_entries':len(meta['stashes'])}
