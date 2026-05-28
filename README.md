# Yol Takip

Iki telefonun ayni oda kodu ile birbirini haritada takip etmesi icin kucuk bir mobil web uygulamasi.

## Calistirma

Windows'ta `start-windows.bat` dosyasina cift tiklayin.

Node.js kuruluysa terminalden de calisir:

```bash
node server.mjs
```

Yerelde test: `http://localhost:3000`

Telefon GPS izni icin canli kullanimda uygulamayi HTTPS destekleyen bir sunucuya koymak gerekir. Render gibi WebSocket destekleyen bir Node host uygundur.

## Render deploy

Bu klasor GitHub/GitLab/Bitbucket deposuna push edildikten sonra Render Blueprint ile yayinlanabilir.

Render ayari: `render.yaml`

## Kullanim

1. Iki telefonda da ayni adresi acin.
2. Ayni oda kodunu yazin. Ornek: `TATIL2026`
3. Arac adini yazin ve `Takibi baslat` butonuna basin.
4. Tarayici konum izni isterse izin verin.
5. Sohbet alanindan yazi gonderin veya `Mic` dugmesine basili tutarak sesli mesaj kaydedin.

Oda kodunu bilen herkes o odaya girebilir. Tatil bitince kodu kullanmayin veya uygulamayi kapatin.
