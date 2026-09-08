-- 0003_units_sold_price.sql
--
-- "Ciro" (gerçekleşen satış bedeli) ile units.price (güncel/liste fiyatı)
-- birbirinden ayrılıyor. Öncesinde units.price, birim SOLD olduktan sonra
-- bile PATCH /api/units/:id ile serbestçe değiştirilebiliyordu — bu da
-- dashboard/admin "Ciro" toplamının geçmişe dönük olarak sessizce
-- değişebilmesi anlamına geliyordu (satış anındaki gerçekleşen bedel hiçbir
-- yerde donmuş halde saklanmıyordu). Bu migration'dan sonra:
--   - units.sold_price, bir birim SOLD durumuna geçtiği anda backend
--     tarafından otomatik dolduruluyor (portal-api-worker.js, PATCH
--     /api/units/:id handler'ı) ve o andan sonra hiçbir API ucundan
--     değiştirilemiyor.
--   - price alanı, birim CONTRACT veya SOLD durumundayken artık PATCH ile
--     değiştirilemiyor (price_locked_after_contract hatası döner).
--   - Ciro toplamları (dashboard, admin stats, AI asistan cevapları)
--     SUM(COALESCE(sold_price, price)) kullanacak şekilde güncellendi.
--
-- GERİYE UYUMLULUK: Bu migration'dan ÖNCE zaten SOLD olmuş birimler için
-- sold_price NULL olurdu (COALESCE price'a düşerdi) — bu yüzden aşağıda
-- mevcut SOLD kayıtlar için sold_price, o anki price ile BİR KEREYE MAHSUS
-- dondurulur. Bu satırdan sonra o birimlerin price'ı da PATCH ile
-- değiştirilemez hale gelir (kod tarafında CONTRACT/SOLD kilidi zaten var).
--
-- UYARI: SQLite'ta "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" yoktur. Bu
-- migration GÜVENLİ ŞEKİLDE TEKRAR ÇALIŞTIRILAMAZ — ikinci çalıştırma
-- "duplicate column name" hatası verir. Yalnızca bir kez uygulayın.
--
-- GERİ ALMA: `ALTER TABLE units DROP COLUMN sold_price;` (SQLite 3.35+ /
-- Cloudflare D1 destekler). Geri almadan önce COALESCE(sold_price, price)
-- kullanan sorguların (portal-api-worker.js içindeki 4 SUM(price) sorgusu)
-- de eski haline döndürülmesi gerekir, aksi halde kod hatalı sorgu üretir.

ALTER TABLE units ADD COLUMN sold_price REAL;

UPDATE units SET sold_price = price WHERE status = 'SOLD' AND sold_price IS NULL;
