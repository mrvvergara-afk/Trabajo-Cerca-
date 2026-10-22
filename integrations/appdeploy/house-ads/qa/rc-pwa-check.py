import json, hashlib, struct, zlib
from pathlib import Path
from PIL import Image
root=Path('public'); icons=[]
for name,size in [('icon-192.png',192),('icon-512.png',512),('icon-maskable-512.png',512)]:
    path=root/name; data=path.read_bytes(); offset=8
    while offset<len(data):
        n=struct.unpack('>I',data[offset:offset+4])[0]; kind=data[offset+4:offset+8]; body=data[offset+8:offset+8+n]
        assert len(body)==n
        assert zlib.crc32(kind+body)==struct.unpack('>I',data[offset+8+n:offset+12+n])[0]
        offset+=n+12
    assert offset==len(data)
    im=Image.open(path); im.load(); assert im.size==(size,size)
    icons.append({'name':name,'size':[size,size],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'decoded':True,'crc_valid':True})
im=Image.open(root/'icon-maskable-512.png').convert('RGBA'); outside=0
for y in range(512):
    for x in range(512):
        r,g,b,a=im.getpixel((x,y)); assert a==255
        foreground=(g>r+45 and g>b+45) or (r>180 and g>180 and b>180)
        if foreground and (x-256)**2+(y-256)**2>(512*.4)**2: outside+=1
assert outside==0
manifest=json.loads((root/'manifest.webmanifest').read_text())
assert manifest['scope']=='./' and manifest['start_url']=='./'
assert len(manifest['icons'])==3
report={'icons':icons,'maskable_foreground_outside_safe_circle':outside,'manifest_validated':True,'derived_from_existing_192_icon':True,'os_installation_tested':False,'deployed':False}
Path('qa-output').mkdir(exist_ok=True);Path('qa-output/rc-pwa.json').write_text(json.dumps(report,indent=2))
print('RC_PWA_PROOF '+json.dumps(report))
