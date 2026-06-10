import io
import sys
import zipfile

path = sys.argv[1]
changed = 0

with zipfile.ZipFile(path, 'r') as zin:
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename.endswith('.js') and b'headerShown: false' in data:
                data = data.replace(b'headerShown: false', b'headerShown: true')
                changed += 1
            zout.writestr(info, data)

    if changed:
        with open(path, 'wb') as f:
            f.write(out.getvalue())

print(changed)
