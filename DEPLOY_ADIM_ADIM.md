# Veraliq — Canlıya Alma Rehberi (Siz Kendi Bilgisayarınızda Uygularsınız)

Bu rehber, aşağıdaki adımları **kendi bilgisayarınızda, kendi hesaplarınızla**
uygulamanız için yazılmıştır. Ben (Claude) hesaplarınıza giremediğim,
kimlik bilgisi giremediğim ve sizin bilgisayarınıza erişemediğim için
bu adımları sizin çalıştırmanız gerekiyor — ama her adım kopyala-yapıştır
kadar basit olacak şekilde hazırlandı. Toplam süre: ~15-20 dakika.

---

## 0. Bu zip'i bilgisayarınıza kaydedin — bu sizin ilk yedeğiniz

`veraliq-site.zip` dosyasını indirip bilgisayarınızda bir klasöre (ör.
`Belgelerim/veraliq`) çıkarın. Bu klasör artık projenizin yerel kopyası —
hiçbir bulut hesabına bağlı olmadan bile elinizde duruyor.

---

## 1. GitHub'a yükleyin

```bash
cd veraliq-site
git init
git add .
git commit -m "İlk sürüm"
```

Sonra https://github.com/new adresinden `veraliq-com` adında yeni, **boş**
bir repo oluşturun (README eklemeden), ardından:

```bash
git remote add origin https://github.com/KULLANICI_ADINIZ/veraliq-com.git
git branch -M main
git push -u origin main
```

Bu noktada GitHub sizden giriş yapmanızı isteyecek — bu ekranı yalnızca
siz görüp kendi şifrenizi/token'ınızı gireceksiniz.

---

## 2. Cloudflare Pages'e bağlayın

1. https://dash.cloudflare.com adresine kendi hesabınızla giriş yapın.
2. **Workers & Pages → Create → Pages → Connect to Git** yolunu izleyin.
3. Az önce oluşturduğunuz `veraliq-com` reposunu seçin.
4. Build ayarları: bu statik bir site olduğu için "Build command" ve
   "Output directory" alanlarını boş bırakabilir veya output directory'yi
   `/` (kök dizin) olarak bırakabilirsiniz.
5. **Save and Deploy**'a tıklayın. Birkaç dakika içinde
   `veraliq-com.pages.dev` gibi bir adres canlı olacak.

## 3. Kendi alan adınızı bağlayın (veraliq.com)

1. Cloudflare Pages projenizde **Custom domains → Set up a custom domain**.
2. `veraliq.com` yazın, Cloudflare talimatları otomatik DNS kaydını önerecek
   (alan adınız zaten Cloudflare'de yönetiliyorsa tek tıkla eklenir).
3. SSL sertifikası otomatik ve ücretsiz olarak birkaç dakika içinde aktif olur.

## 4. Backend'i (AI asistan) deploy edin

`worker/README.md` dosyasındaki adımları izleyin — özet:
```bash
npm install -g wrangler
cd worker
wrangler login
wrangler deploy
wrangler secret put GEMINI_API_KEY
```
Sonra `script.js` içindeki `ASSISTANT_ENDPOINT` satırını worker'ın verdiği
gerçek URL ile güncelleyip GitHub'a tekrar push edin — Cloudflare Pages
her push'ta otomatik yeniden deploy eder:
```bash
git add script.js
git commit -m "Asistan backend URL güncellendi"
git push
```

## 5. Eski/önceki kurulum varsa ne yapmalısınız

Eğer daha önce veraliq.com için başka bir Cloudflare/GitHub kurulumunuz
varsa ve bunu temizlemek istiyorsanız:
- Cloudflare **Workers & Pages** listesinde eski projeyi bulup **Delete**
  butonuna kendiniz basmanız gerekiyor (bunu sizin adınıza yapamam).
- Eski DNS kayıtları varsa **DNS** sekmesinden elle silinir.
- Bunu yaparken dikkat: eğer o eski kurulumda gerçek müşteri verisi/e-posta
  vs. varsa, silmeden önce yedeğini alın.

---

## Bundan sonra siz her `git push` yaptığınızda:
Cloudflare Pages otomatik olarak yeni sürümü algılar ve birkaç saniye
içinde canlıya alır — ayrıca bir şey yapmanıza gerek kalmaz.
