/* ==========================================================================
   VERALIQ — Şirket Portalı / Admin Paneli çoklu dil sözlüğü.
   ==========================================================================
   İmparator'un talebi (2026-08-27): "şirket portal ekranları ve mobil
   uygulamalara türkçe önceligimiz olsun sadece ingilizce rusça ekleyelim
   tercihe bağlı şekilde" — Türkçe VARSAYILAN dil, İngilizce ve Rusça
   TERCİHE BAĞLI (kullanıcı seçer, dil değişmezse Türkçe kalır).

   index.html'in kendi i18n.js'i (8 dil, data-i18n attribute tabanlı) ile
   KARIŞTIRILMASIN — bu, portal.html + admin.html için AYRI, daha küçük bir
   sistemdir, çünkü buradaki tüm içerik data-i18n ile değil, JS içinde
   dinamik olarak (viewHead/table/vb.) üretiliyor. Bu yüzden T(key) şeklinde
   bir fonksiyon çağrısı kullanılıyor (bkz. portal.html/admin.html'deki
   inline <script> içindeki T() tanımı).

   GÜNCELLEME (2026-08-27): "AI Asistan" sohbet ekranı da artık tam çevrili.
   İlk turda öneri çipleri/karşılama/placeholder BİLEREK Türkçe bırakılmıştı
   (backend sabit TÜRKÇE kalıplarla çalıştığı için). İmparator'ın "şirket
   yetkilisi ingilizce veya rusça konuşursa mantıken asistanının o dili
   konuşması gerekir" talebi üzerine worker-portal/portal-api-worker.js'deki
   answerAssistantQuery() ÇOK DİLLİ hale getirildi: artık soru hangi dilde
   yazılırsa yazılsın (tr/en/ru anahtar kelimeleri) niyet aynı şekilde
   tanınıyor, cevap ise bu ekranın gönderdiği `lang` parametresine göre o
   dilde üretiliyor — Zero Trust AI ilkesi DEĞİŞMEDİ, hâlâ hiçbir LLM SQL
   üretmiyor, yalnızca sabit kalıp eşleştirme + gerçek D1 sorgusu var.
   ========================================================================== */
window.VERALIQ_PORTAL_I18N = {
  defaultLang: 'tr',
  languages: [
    { code: 'tr', name: 'Türkçe' },
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' }
  ],
  dict: {
    tr: {
      "common.loading":"Yükleniyor…","common.noRecords":"Kayıt yok.","common.save":"Kaydet","common.send":"Gönder","common.add":"Ekle","common.remove":"Kaldır",
      "common.viewNotFound":"Ekran bulunamadı.","common.sidebarFooter":"v1 · gerçek backend","common.myCompanyDefault":"Şirketim",
      "common.logout":"Çıkış","common.statusLabel":"Durum","common.descriptionLabel":"Açıklama","common.locationLabel":"Konum",
      "common.deliveryDateLabel":"Teslim Tarihi","common.aiAgent":"AI Agent","common.humanAgent":"İnsan Temsilci",
      "common.genericErrorPrefix":"Bir hata oluştu: ","common.unitsWord":"birim","common.soldWord":"satıldı",
      "common.nameLabel":"Ad Soyad","common.phoneLabel":"Telefon","common.emailLabel":"E-posta","common.passwordLabel":"Şifre","common.all":"Tümü",
      "common.statusUpdatedPrefix":"Durum güncellendi: ","common.unknown":"bilinmeyen",

      "nav.group.general":"Genel","nav.group.operations":"Operasyon","nav.group.salesCustomer":"Satış & Müşteri",
      "nav.group.financeDoc":"Finans & Belge","nav.group.planning":"Planlama","nav.group.system":"Sistem",
      "nav.item.dashboard":"Panel","nav.item.assistant":"AI Asistan","nav.item.projects":"Projeler","nav.item.inventory":"Envanter",
      "nav.item.presentations":"Sunumlar","nav.item.reservations":"Rezervasyonlar","nav.item.leads":"Lead'ler",
      "nav.item.customers":"Müşteriler","nav.item.sales":"Satışlar","nav.item.crm":"CRM","nav.item.payments":"Ödemeler",
      "nav.item.contracts":"Sözleşmeler","nav.item.documents":"Belgeler","nav.item.calendar":"Takvim","nav.item.reports":"Raporlar",
      "nav.item.agents":"Agent'lar","nav.item.team":"Ekip","nav.item.integrations":"Entegrasyonlar","nav.item.settings":"Ayarlar",

      "status.unit.AVAILABLE":"Boşta","status.unit.PRESENTATION":"Sunumda","status.unit.HOLD":"Tutuldu",
      "status.unit.RESERVED":"Rezerve","status.unit.DEPOSIT_PAID":"Kapora Alındı","status.unit.CONTRACT":"Sözleşmede","status.unit.SOLD":"Satıldı",
      "status.project.planning":"Planlama","status.project.construction":"İnşaat","status.project.selling":"Satışta","status.project.completed":"Tamamlandı",
      "status.lead.new":"Yeni","status.lead.qualified":"Nitelikli","status.lead.presentation":"Sunum","status.lead.negotiating":"Müzakere",
      "status.lead.won":"Kazanıldı","status.lead.lost":"Kaybedildi",

      "role.owner":"Sahip","role.staff":"Personel","role.manager":"Yönetici","role.salesManager":"Satış Müdürü",
      "role.salesAgent":"Satış Temsilcisi","role.viewer":"İzleyici (salt-okunur)",
      "role.staffFullAccess":"Personel (tam erişim)","role.managerApproval":"Yönetici (+ onay yetkisi)","role.viewerOnly":"İzleyici (yalnızca görüntüleme)",

      "error.invalidCredentials":"E-posta veya şifre hatalı.","error.companyInactive":"Şirket hesabı pasif durumda — VERALIQ ile iletişime geçin.",
      "error.missingFields":"Lütfen tüm alanları doldurun.","error.emailTaken":"Bu e-posta zaten kullanılıyor.",
      "error.passwordTooShort":"Şifre en az 8 karakter olmalı.","error.forbidden":"Bu işlem için yetkiniz yok.",
      "error.cannotRemoveOwner":"Şirket sahibi hesabı kaldırılamaz.","error.invalidStatusTransition":"Bu durum geçişine izin verilmiyor.",
      "error.alreadyDecided":"Bu talep zaten karara bağlanmış.",

      "login.loginBtn":"Giriş Yap","login.hint":"Bu portal Cloudflare D1 üzerinde çalışan gerçek bir backend'e bağlıdır — verileriniz sunucuda saklanır.",
      "login.errRequired":"E-posta ve şifre gerekli.",

      "dashboard.sub":"Gerçek zamanlı satış, envanter ve operasyon özeti.",
      "dashboard.stat.totalLeads":"Toplam Lead","dashboard.stat.todayLeads":"Bugünkü Lead","dashboard.stat.presentations":"Sunumda",
      "dashboard.stat.holds":"Tutulan","dashboard.stat.reservations":"Rezerve","dashboard.stat.deposits":"Kapora Alındı",
      "dashboard.stat.contracts":"Sözleşmede","dashboard.stat.sales":"Satış","dashboard.stat.revenue":"Ciro",
      "dashboard.stat.activeStock":"Aktif Stok (Boşta)","dashboard.stat.pendingApproval":"Bekleyen Onay",
      "dashboard.performanceTitle":"AI Agent Performansı / İnsan Satış Performansı",
      "dashboard.performanceNote":"— gerçek sunum kilidi (presentation lock) kayıtlarından",
      "dashboard.presentationsStarted":"başlatılan sunum","dashboard.loadFailed":"Panel yüklenemedi: ",

      "assistant.sub":"Şirket yöneticisi asistanı — gerçek veritabanı verisiyle cevap verir, müşteriye satış yapan agent DEĞİLDİR.",
      "assistant.note":"v1: Bu asistan, Zero Trust AI ilkesine uygun olarak serbest metin SQL üretmez — sabit, önceden tanımlı ve parametreli sorgu kalıplarıyla çalışır. Cevaplar her zaman gerçek veritabanı değerleridir, asla uydurma değildir.",
      "assistant.welcome":"Merhaba, ben şirket yönetim asistanınızım. Lead, satış, stok, onay ve sunum durumlarınız hakkında bana soru sorabilirsiniz — cevaplar gerçek veritabanı verinize dayanır.",
      "assistant.placeholder":"Örn. ABC Vadi Konutları kaç daire kaldı?",
      "assistant.suggestLeadsToday":"Bugün kaç lead geldi?","assistant.suggestPendingApprovals":"Bekleyen onaylar?",
      "assistant.suggestSalesToday":"Bugünkü satışlar?","assistant.suggestPresentations":"Sunumda kaç birim var?",

      "projects.sub":"Projeleriniz ve temel bilgileri.","projects.addBtn":"+ Proje Ekle","projects.nameLabel":"Proje Adı *",
      "projects.namePlaceholder":"Örn. Vadi Konutları 2","projects.locationPlaceholder":"Örn. İstanbul / Ataşehir",
      "projects.adaLabel":"Ada","projects.parselLabel":"Parsel","projects.paftaLabel":"Pafta",
      "projects.nameRequired":"Proje adı gerekli.","projects.added":"Proje eklendi.","projects.noProjects":"Henüz proje eklenmedi.",
      "projects.deliveryPrefix":"Teslim:",

      "inventory.sub":"Tüm projelerdeki gerçek zamanlı birim envanteri.",

      "table.colProject":"Proje","table.colUnit":"Birim","table.colType":"Tip","table.colPrice":"Fiyat","table.colUpdated":"Güncelleme",
      "table.colAction":"İşlem","table.colName":"Ad","table.colContact":"İletişim","table.colBudget":"Bütçe","table.colSource":"Kaynak",
      "table.colStatus":"Durum","table.colDate":"Tarih","table.colEmail":"E-posta","table.colRole":"Rol","table.colAmount":"Tutar",
      "table.colNote":"Not","table.colCustomerSince":"Müşteri Olma Tarihi",

      "presentations.sub":"Şu anda sunum halinde olan birimler — presentation lock ile korunur, iki agent aynı birimi aynı anda sunamaz.",

      "reservations.sub":"Rezerve edilmiş ve kaporası alınmış birimler.",

      "sales.sub":"Satışı tamamlanmış birimler (units.status = SOLD).","sales.totalSales":"Toplam Satış","sales.totalRevenue":"Toplam Ciro",

      "contracts.sub":"Sözleşme aşamasındaki ve tamamlanmış satışlar.","contracts.completed":"Tamamlanan (Satıldı)",
      "contracts.note":"Sözleşme şablonu yükleme ve e-imza altyapısı henüz bağlı değil — bu, ayrı bir e-imza sağlayıcı hesabı gerektiriyor. Şu an bu ekran sözleşme AŞAMASINDAKİ gerçek birimleri gösteriyor.",

      "leads.sub":"Tüm potansiyel müşteri kayıtları.","leads.addBtn":"+ Lead Ekle","leads.interestLabel":"İlgi / Not","leads.budgetLabel":"Bütçe (TRY)",
      "leads.nameRequired":"Ad soyad gerekli.","leads.added":"Lead eklendi.","leads.noLeads":"Henüz lead yok.",
      "leads.statusUpdated":"Lead durumu güncellendi.",

      "customers.sub":"Satışı kazanılmış (won) lead'lerden oluşan müşteri listesi.","customers.noCustomers":"Henüz \"kazanıldı\" durumunda müşteri yok.",

      "crm.sub":"Satış hunisi — lead durumlarına göre gerçek zamanlı dağılım.",
      "crm.note":"Harici CRM senkronu (HubSpot/Salesforce/Zoho/Dynamics/Webhook) henüz bağlı değil — bu, ilgili sağlayıcının API anahtarını gerektiriyor. Bu ekran şu an VERALIQ'ın kendi dahili CRM verisini (leads tablosu) gösteriyor.",

      "payments.sub":"İndirim / ödeme planı onay talepleri (approval engine).",
      "payments.ownerOnlyNote":"Onaylama yetkisi yalnızca şirket sahibi (company_owner) hesabındadır.","payments.decided":"Karar kaydedildi.",
      "payments.approve":"Onayla","payments.reject":"Reddet",

      "documents.sub":"Proje ve sözleşme belgeleri.",
      "documents.note":"<b>Bu ekran henüz dosya yükleme yapamıyor.</b> Veritabanı şemasında belge METADATA'sı için bir tablo hazır, ancak gerçek dosya depolama (Cloudflare R2 bucket) bu şirket hesabında henüz kurulmadı. Bu, sahte bir \"yükle\" butonu koymak yerine dürüst bir şekilde burada belirtiliyor — R2 bucket'ı kurulduğunda bu ekran gerçek yükleme/indirme ile çalışacak şekilde bağlanacak.",

      "calendar.sub":"Randevu ve takvim yönetimi.",
      "calendar.note":"<b>Randevu/takvim altyapısı henüz kurulmadı.</b> Veritabanında bir randevu tablosu yok — bu, ayrı bir geliştirme fazı (yeni bir tablo + API uçları) gerektiriyor. Sahte randevu göstermek yerine bu gerçek durumu belirtiyoruz.",

      "integrations.sub":"Harici CRM/ERP ve diğer servis bağlantıları.",
      "integrations.note":"<b>Harici entegrasyon (HubSpot/Salesforce/Zoho/Dynamics/WhatsApp Business API/ödeme sağlayıcısı) henüz bağlı değil.</b> Bunların her biri kendi API anahtarınızı/hesabınızı gerektiriyor. VERALIQ mimarisi provider-agnostic tasarlandığı için bu servisler siz hazır olduğunuzda mevcut mimariye eklenebilir.",

      "reports.sub":"Gerçek verilerden anlık rapor ve dışa aktarma.","reports.downloadCsv":"CSV İndir",
      "reports.csvHeader":"metrik,değer","reports.csvFilename":"veraliq-rapor.csv",
      "reports.note":"v1: rapor verisi CSV olarak indirilebilir. PDF export + şirket logosu/filigranı ayrı bir geliştirme adımı.",

      "agents.sub":"AI ve insan satış temsilcilerinin gerçek sunum performansı.",
      "agents.presentationNote":"gerçekleştirdiği sunum (presentation lock kayıtları)",
      "agents.note":"Bu sayılar audit_log tablosundaki gerçek \"unit.presentation_lock\" kayıtlarından hesaplanır — tahmini/uydurma bir performans skoru değildir.",

      "team.sub":"Portala erişimi olan kullanıcılar.","team.addBtn":"+ Üye Ekle","team.tempPasswordLabel":"Geçici Şifre",
      "team.tempPasswordPlaceholder":"En az 8 karakter","team.roleLabel":"Rol","team.allFieldsRequired":"Tüm alanlar gerekli.",
      "team.added":"Ekip üyesi eklendi.","team.confirmRemove":"Bu kullanıcıyı ekipten kaldırmak istediğinize emin misiniz?","team.removed":"Kaldırıldı.",

      "settings.sub":"Şirket bilgileri ve hesap ayarları.","settings.companyInfo":"Şirket Bilgileri","settings.companyNameLabel":"Şirket Adı",
      "settings.ownerOnlyHint":"Şirket bilgilerini yalnızca şirket sahibi değiştirebilir.","settings.changePasswordTitle":"Şifre Değiştir",
      "settings.currentPasswordLabel":"Mevcut Şifre","settings.newPasswordLabel":"Yeni Şifre","settings.changePasswordBtn":"Şifreyi Değiştir",
      "settings.bothFieldsRequired":"Her iki alan da gerekli.","settings.companyUpdated":"Şirket bilgileri güncellendi.",
      "settings.passwordUpdated":"Şifreniz güncellendi.","settings.exportTitle":"Verilerinizi Dışa Aktarın",
      "settings.exportHint":"Şirketinize ait TÜM veriler (projeler, birimler, lead'ler, müşteriler, görüşme geçmişi, onaylar, denetim kaydı) tek bir JSON dosyası olarak indirilir. VERALIQ'a veya herhangi bir sağlayıcıya bağımlı kalmadan verinizin her zaman sizin olduğunu garanti eder.",
      "settings.exportBtn":"Tüm Verilerimi İndir (.json)","settings.preparing":"Hazırlanıyor…","settings.dataDownloaded":"Verileriniz indirildi.",

      "agentWidget.title":"Şirket Asistanı","agentWidget.halfScreen":"Yarım ekran","agentWidget.fullScreen":"Tam ekran",
      "agentWidget.minimize":"Küçült","agentWidget.close":"Kapat","agentWidget.preparing":"Asistan hazırlanıyor…",
      "agentWidget.micBlocked":"Mikrofon izni verilmedi. Asistan sizi duyamıyor — tarayıcı ayarlarından mikrofon iznini açıp sayfayı yenileyin. Yazarak da devam edebilirsiniz (AI Asistan menüsü).",
      "agentWidget.joinBtn":"Görüşmeye Katıl","agentWidget.joinHint":"Mikrofonunuzu kullanmak için tıklayın",
      "agentWidget.reopenBtn":"Asistanı Aç","agentWidget.expandAria":"Şirket Asistanı'nı genişlet",

      "lang.switcherLabel":"Dil",

      "admin.nav.dashboard":"Panel","admin.nav.assistant":"AI Asistan","admin.nav.agents":"Agent'lar","admin.nav.auditLog":"Denetim Kaydı"
    },
    en: {
      "common.loading":"Loading…","common.noRecords":"No records.","common.save":"Save","common.send":"Send","common.add":"Add","common.remove":"Remove",
      "common.viewNotFound":"Screen not found.","common.sidebarFooter":"v1 · real backend","common.myCompanyDefault":"My Company",
      "common.logout":"Log out","common.statusLabel":"Status","common.descriptionLabel":"Description","common.locationLabel":"Location",
      "common.deliveryDateLabel":"Delivery Date","common.aiAgent":"AI Agent","common.humanAgent":"Human Rep",
      "common.genericErrorPrefix":"An error occurred: ","common.unitsWord":"units","common.soldWord":"sold",
      "common.nameLabel":"Full Name","common.phoneLabel":"Phone","common.emailLabel":"Email","common.passwordLabel":"Password","common.all":"All",
      "common.statusUpdatedPrefix":"Status updated: ","common.unknown":"unknown",

      "nav.group.general":"General","nav.group.operations":"Operations","nav.group.salesCustomer":"Sales & Customers",
      "nav.group.financeDoc":"Finance & Docs","nav.group.planning":"Planning","nav.group.system":"System",
      "nav.item.dashboard":"Dashboard","nav.item.assistant":"AI Assistant","nav.item.projects":"Projects","nav.item.inventory":"Inventory",
      "nav.item.presentations":"Presentations","nav.item.reservations":"Reservations","nav.item.leads":"Leads",
      "nav.item.customers":"Customers","nav.item.sales":"Sales","nav.item.crm":"CRM","nav.item.payments":"Payments",
      "nav.item.contracts":"Contracts","nav.item.documents":"Documents","nav.item.calendar":"Calendar","nav.item.reports":"Reports",
      "nav.item.agents":"Agents","nav.item.team":"Team","nav.item.integrations":"Integrations","nav.item.settings":"Settings",

      "status.unit.AVAILABLE":"Available","status.unit.PRESENTATION":"In Presentation","status.unit.HOLD":"On Hold",
      "status.unit.RESERVED":"Reserved","status.unit.DEPOSIT_PAID":"Deposit Paid","status.unit.CONTRACT":"In Contract","status.unit.SOLD":"Sold",
      "status.project.planning":"Planning","status.project.construction":"Construction","status.project.selling":"Selling","status.project.completed":"Completed",
      "status.lead.new":"New","status.lead.qualified":"Qualified","status.lead.presentation":"Presentation","status.lead.negotiating":"Negotiating",
      "status.lead.won":"Won","status.lead.lost":"Lost",

      "role.owner":"Owner","role.staff":"Staff","role.manager":"Manager","role.salesManager":"Sales Manager",
      "role.salesAgent":"Sales Agent","role.viewer":"Viewer (read-only)",
      "role.staffFullAccess":"Staff (full access)","role.managerApproval":"Manager (+ approval rights)","role.viewerOnly":"Viewer (view only)",

      "error.invalidCredentials":"Incorrect email or password.","error.companyInactive":"Company account is inactive — contact VERALIQ.",
      "error.missingFields":"Please fill in all fields.","error.emailTaken":"This email is already in use.",
      "error.passwordTooShort":"Password must be at least 8 characters.","error.forbidden":"You don't have permission for this action.",
      "error.cannotRemoveOwner":"The company owner account cannot be removed.","error.invalidStatusTransition":"This status change is not allowed.",
      "error.alreadyDecided":"This request has already been decided.",

      "login.loginBtn":"Log In","login.hint":"This portal connects to a real backend running on Cloudflare D1 — your data is stored on the server.",
      "login.errRequired":"Email and password are required.",

      "dashboard.sub":"Real-time overview of sales, inventory, and operations.",
      "dashboard.stat.totalLeads":"Total Leads","dashboard.stat.todayLeads":"Today's Leads","dashboard.stat.presentations":"In Presentation",
      "dashboard.stat.holds":"On Hold","dashboard.stat.reservations":"Reserved","dashboard.stat.deposits":"Deposit Paid",
      "dashboard.stat.contracts":"In Contract","dashboard.stat.sales":"Sales","dashboard.stat.revenue":"Revenue",
      "dashboard.stat.activeStock":"Active Stock (Available)","dashboard.stat.pendingApproval":"Pending Approval",
      "dashboard.performanceTitle":"AI Agent Performance / Human Sales Performance",
      "dashboard.performanceNote":"— from real presentation lock records",
      "dashboard.presentationsStarted":"presentations started","dashboard.loadFailed":"Dashboard failed to load: ",

      "assistant.sub":"Company management assistant — answers using real database data; this is NOT the customer-facing sales agent.",
      "assistant.note":"v1: In line with the Zero Trust AI principle, this assistant never generates free-text SQL — it works with fixed, predefined, parameterized query patterns. Answers are always real database values, never fabricated.",
      "assistant.welcome":"Hello, I'm your company management assistant. You can ask me about leads, sales, stock, approvals, and presentation status — answers are based on your real database data.",
      "assistant.placeholder":"e.g. How many units are left in ABC Vadi Residences?",
      "assistant.suggestLeadsToday":"How many leads came in today?","assistant.suggestPendingApprovals":"Pending approvals?",
      "assistant.suggestSalesToday":"Today's sales?","assistant.suggestPresentations":"How many units are in presentation?",

      "projects.sub":"Your projects and key details.","projects.addBtn":"+ Add Project","projects.nameLabel":"Project Name *",
      "projects.namePlaceholder":"e.g. Vadi Residences 2","projects.locationPlaceholder":"e.g. Istanbul / Ataşehir",
      "projects.adaLabel":"Block","projects.parselLabel":"Parcel","projects.paftaLabel":"Sheet",
      "projects.nameRequired":"Project name is required.","projects.added":"Project added.","projects.noProjects":"No projects added yet.",
      "projects.deliveryPrefix":"Delivery:",

      "inventory.sub":"Real-time unit inventory across all your projects.",

      "table.colProject":"Project","table.colUnit":"Unit","table.colType":"Type","table.colPrice":"Price","table.colUpdated":"Updated",
      "table.colAction":"Action","table.colName":"Name","table.colContact":"Contact","table.colBudget":"Budget","table.colSource":"Source",
      "table.colStatus":"Status","table.colDate":"Date","table.colEmail":"Email","table.colRole":"Role","table.colAmount":"Amount",
      "table.colNote":"Note","table.colCustomerSince":"Customer Since",

      "presentations.sub":"Units currently being presented — protected by a presentation lock, so two agents can never present the same unit at once.",

      "reservations.sub":"Reserved units and units with a deposit paid.",

      "sales.sub":"Units with completed sales (units.status = SOLD).","sales.totalSales":"Total Sales","sales.totalRevenue":"Total Revenue",

      "contracts.sub":"Sales currently in the contract stage, and completed sales.","contracts.completed":"Completed (Sold)",
      "contracts.note":"Contract template upload and e-signature infrastructure isn't connected yet — this requires a separate e-signature provider account. This screen currently shows real units that are IN the contract stage.",

      "leads.sub":"All lead records.","leads.addBtn":"+ Add Lead","leads.interestLabel":"Interest / Note","leads.budgetLabel":"Budget (TRY)",
      "leads.nameRequired":"Full name is required.","leads.added":"Lead added.","leads.noLeads":"No leads yet.",
      "leads.statusUpdated":"Lead status updated.",

      "customers.sub":"Customer list made up of leads marked as won.","customers.noCustomers":"No customers with \"won\" status yet.",

      "crm.sub":"Sales funnel — real-time distribution by lead status.",
      "crm.note":"External CRM sync (HubSpot/Salesforce/Zoho/Dynamics/Webhook) isn't connected yet — that requires an API key from the relevant provider. This screen currently shows VERALIQ's own internal CRM data (the leads table).",

      "payments.sub":"Discount / payment plan approval requests (approval engine).",
      "payments.ownerOnlyNote":"Approval rights belong only to the company owner (company_owner) account.","payments.decided":"Decision recorded.",
      "payments.approve":"Approve","payments.reject":"Reject",

      "documents.sub":"Project and contract documents.",
      "documents.note":"<b>This screen can't upload files yet.</b> The database schema has a table ready for document METADATA, but real file storage (a Cloudflare R2 bucket) hasn't been set up for this company account yet. Rather than adding a fake \"upload\" button, this is stated honestly here — once the R2 bucket is set up, this screen will be wired up for real upload/download.",

      "calendar.sub":"Appointment and calendar management.",
      "calendar.note":"<b>Appointment/calendar infrastructure isn't set up yet.</b> There's no appointments table in the database — that requires a separate development phase (a new table + API endpoints). Rather than showing fake appointments, this states the real status.",

      "integrations.sub":"External CRM/ERP and other service connections.",
      "integrations.note":"<b>External integrations (HubSpot/Salesforce/Zoho/Dynamics/WhatsApp Business API/payment provider) aren't connected yet.</b> Each requires your own API key/account. Since VERALIQ's architecture is provider-agnostic by design, these services can be added whenever you're ready.",

      "reports.sub":"Real-time reporting and export from real data.","reports.downloadCsv":"Download CSV",
      "reports.csvHeader":"metric,value","reports.csvFilename":"veraliq-report.csv",
      "reports.note":"v1: report data can be downloaded as CSV. PDF export + company logo/watermark is a separate development step.",

      "agents.sub":"Real presentation performance of AI and human sales reps.",
      "agents.presentationNote":"presentations given (presentation lock records)",
      "agents.note":"These numbers are calculated from real \"unit.presentation_lock\" records in the audit_log table — not an estimated or fabricated performance score.",

      "team.sub":"Users with access to the portal.","team.addBtn":"+ Add Member","team.tempPasswordLabel":"Temporary Password",
      "team.tempPasswordPlaceholder":"At least 8 characters","team.roleLabel":"Role","team.allFieldsRequired":"All fields are required.",
      "team.added":"Team member added.","team.confirmRemove":"Are you sure you want to remove this user from the team?","team.removed":"Removed.",

      "settings.sub":"Company information and account settings.","settings.companyInfo":"Company Information","settings.companyNameLabel":"Company Name",
      "settings.ownerOnlyHint":"Only the company owner can change company information.","settings.changePasswordTitle":"Change Password",
      "settings.currentPasswordLabel":"Current Password","settings.newPasswordLabel":"New Password","settings.changePasswordBtn":"Change Password",
      "settings.bothFieldsRequired":"Both fields are required.","settings.companyUpdated":"Company information updated.",
      "settings.passwordUpdated":"Your password has been updated.","settings.exportTitle":"Export Your Data",
      "settings.exportHint":"ALL data belonging to your company (projects, units, leads, customers, conversation history, approvals, audit log) is downloaded as a single JSON file. This guarantees your data is always yours — not locked into VERALIQ or any provider.",
      "settings.exportBtn":"Download All My Data (.json)","settings.preparing":"Preparing…","settings.dataDownloaded":"Your data has been downloaded.",

      "agentWidget.title":"Company Assistant","agentWidget.halfScreen":"Half screen","agentWidget.fullScreen":"Full screen",
      "agentWidget.minimize":"Minimize","agentWidget.close":"Close","agentWidget.preparing":"Assistant is getting ready…",
      "agentWidget.micBlocked":"Microphone access wasn't granted. The assistant can't hear you — enable microphone permission in your browser settings and reload the page. You can also continue by typing (AI Assistant menu).",
      "agentWidget.joinBtn":"Join Conversation","agentWidget.joinHint":"Click to use your microphone",
      "agentWidget.reopenBtn":"Open Assistant","agentWidget.expandAria":"Expand Company Assistant",

      "lang.switcherLabel":"Language",

      "admin.nav.dashboard":"Dashboard","admin.nav.assistant":"AI Assistant","admin.nav.agents":"Agents","admin.nav.auditLog":"Audit Log"
    },
    ru: {
      "common.loading":"Загрузка…","common.noRecords":"Нет записей.","common.save":"Сохранить","common.send":"Отправить","common.add":"Добавить","common.remove":"Удалить",
      "common.viewNotFound":"Экран не найден.","common.sidebarFooter":"v1 · реальный бэкенд","common.myCompanyDefault":"Моя компания",
      "common.logout":"Выйти","common.statusLabel":"Статус","common.descriptionLabel":"Описание","common.locationLabel":"Расположение",
      "common.deliveryDateLabel":"Дата сдачи","common.aiAgent":"AI-агент","common.humanAgent":"Менеджер-человек",
      "common.genericErrorPrefix":"Произошла ошибка: ","common.unitsWord":"ед.","common.soldWord":"продано",
      "common.nameLabel":"ФИО","common.phoneLabel":"Телефон","common.emailLabel":"Эл. почта","common.passwordLabel":"Пароль","common.all":"Все",
      "common.statusUpdatedPrefix":"Статус обновлён: ","common.unknown":"неизвестно",

      "nav.group.general":"Общее","nav.group.operations":"Операции","nav.group.salesCustomer":"Продажи и клиенты",
      "nav.group.financeDoc":"Финансы и документы","nav.group.planning":"Планирование","nav.group.system":"Система",
      "nav.item.dashboard":"Панель","nav.item.assistant":"AI-ассистент","nav.item.projects":"Проекты","nav.item.inventory":"Инвентарь",
      "nav.item.presentations":"Показы","nav.item.reservations":"Резервации","nav.item.leads":"Лиды",
      "nav.item.customers":"Клиенты","nav.item.sales":"Продажи","nav.item.crm":"CRM","nav.item.payments":"Платежи",
      "nav.item.contracts":"Договоры","nav.item.documents":"Документы","nav.item.calendar":"Календарь","nav.item.reports":"Отчёты",
      "nav.item.agents":"Агенты","nav.item.team":"Команда","nav.item.integrations":"Интеграции","nav.item.settings":"Настройки",

      "status.unit.AVAILABLE":"Свободно","status.unit.PRESENTATION":"На показе","status.unit.HOLD":"Придержано",
      "status.unit.RESERVED":"Забронировано","status.unit.DEPOSIT_PAID":"Задаток внесён","status.unit.CONTRACT":"В договоре","status.unit.SOLD":"Продано",
      "status.project.planning":"Планирование","status.project.construction":"Строительство","status.project.selling":"В продаже","status.project.completed":"Завершено",
      "status.lead.new":"Новый","status.lead.qualified":"Квалифицирован","status.lead.presentation":"Показ","status.lead.negotiating":"Переговоры",
      "status.lead.won":"Выигран","status.lead.lost":"Проигран",

      "role.owner":"Владелец","role.staff":"Сотрудник","role.manager":"Менеджер","role.salesManager":"Руководитель продаж",
      "role.salesAgent":"Менеджер по продажам","role.viewer":"Наблюдатель (только просмотр)",
      "role.staffFullAccess":"Сотрудник (полный доступ)","role.managerApproval":"Менеджер (+ право одобрения)","role.viewerOnly":"Наблюдатель (только просмотр)",

      "error.invalidCredentials":"Неверный email или пароль.","error.companyInactive":"Аккаунт компании неактивен — свяжитесь с VERALIQ.",
      "error.missingFields":"Пожалуйста, заполните все поля.","error.emailTaken":"Этот email уже используется.",
      "error.passwordTooShort":"Пароль должен содержать не менее 8 символов.","error.forbidden":"У вас нет прав для этого действия.",
      "error.cannotRemoveOwner":"Учётную запись владельца компании нельзя удалить.","error.invalidStatusTransition":"Этот переход статуса не разрешён.",
      "error.alreadyDecided":"По этому запросу уже принято решение.",

      "login.loginBtn":"Войти","login.hint":"Этот портал подключён к реальному бэкенду на Cloudflare D1 — ваши данные хранятся на сервере.",
      "login.errRequired":"Требуются email и пароль.",

      "dashboard.sub":"Обзор продаж, склада и операций в реальном времени.",
      "dashboard.stat.totalLeads":"Всего лидов","dashboard.stat.todayLeads":"Лиды сегодня","dashboard.stat.presentations":"На показе",
      "dashboard.stat.holds":"Придержано","dashboard.stat.reservations":"Забронировано","dashboard.stat.deposits":"Задаток внесён",
      "dashboard.stat.contracts":"В договоре","dashboard.stat.sales":"Продажи","dashboard.stat.revenue":"Выручка",
      "dashboard.stat.activeStock":"Активный склад (свободно)","dashboard.stat.pendingApproval":"Ожидает одобрения",
      "dashboard.performanceTitle":"Эффективность AI-агента / Эффективность продаж людьми",
      "dashboard.performanceNote":"— на основе реальных записей блокировки показов",
      "dashboard.presentationsStarted":"начатых показов","dashboard.loadFailed":"Не удалось загрузить панель: ",

      "assistant.sub":"Ассистент управления компанией — отвечает на основе реальных данных из базы данных, это НЕ агент по продажам для клиентов.",
      "assistant.note":"v1: В соответствии с принципом Zero Trust AI, этот ассистент никогда не генерирует произвольный SQL — он работает с фиксированными, заранее определёнными параметризованными шаблонами запросов. Ответы всегда основаны на реальных данных, никогда не выдуманы.",
      "assistant.welcome":"Здравствуйте, я ваш ассистент управления компанией. Вы можете спрашивать меня о лидах, продажах, складе, одобрениях и статусах показов — ответы основаны на реальных данных вашей базы данных.",
      "assistant.placeholder":"напр. Сколько юнитов осталось в ЖК ABC Vadi?",
      "assistant.suggestLeadsToday":"Сколько лидов сегодня?","assistant.suggestPendingApprovals":"Ожидающие одобрения?",
      "assistant.suggestSalesToday":"Сегодняшние продажи?","assistant.suggestPresentations":"Сколько юнитов на показе?",

      "projects.sub":"Ваши проекты и основная информация.","projects.addBtn":"+ Добавить проект","projects.nameLabel":"Название проекта *",
      "projects.namePlaceholder":"напр. ЖК Вади 2","projects.locationPlaceholder":"напр. Стамбул / Аташехир",
      "projects.adaLabel":"Квартал","projects.parselLabel":"Участок","projects.paftaLabel":"Лист",
      "projects.nameRequired":"Требуется название проекта.","projects.added":"Проект добавлен.","projects.noProjects":"Проекты ещё не добавлены.",
      "projects.deliveryPrefix":"Сдача:",

      "inventory.sub":"Инвентарь юнитов по всем проектам в реальном времени.",

      "table.colProject":"Проект","table.colUnit":"Юнит","table.colType":"Тип","table.colPrice":"Цена","table.colUpdated":"Обновлено",
      "table.colAction":"Действие","table.colName":"Имя","table.colContact":"Контакт","table.colBudget":"Бюджет","table.colSource":"Источник",
      "table.colStatus":"Статус","table.colDate":"Дата","table.colEmail":"Эл. почта","table.colRole":"Роль","table.colAmount":"Сумма",
      "table.colNote":"Заметка","table.colCustomerSince":"Клиент с",

      "presentations.sub":"Юниты, находящиеся сейчас на показе — защищены блокировкой показа, два агента не могут показывать один юнит одновременно.",

      "reservations.sub":"Забронированные юниты и юниты с внесённым задатком.",

      "sales.sub":"Юниты с завершённой продажей (units.status = SOLD).","sales.totalSales":"Всего продаж","sales.totalRevenue":"Общая выручка",

      "contracts.sub":"Продажи на стадии договора и завершённые продажи.","contracts.completed":"Завершено (Продано)",
      "contracts.note":"Загрузка шаблонов договоров и электронная подпись пока не подключены — для этого нужен отдельный аккаунт провайдера эл. подписи. Этот экран сейчас показывает реальные юниты, находящиеся НА СТАДИИ договора.",

      "leads.sub":"Все записи лидов.","leads.addBtn":"+ Добавить лид","leads.interestLabel":"Интерес / заметка","leads.budgetLabel":"Бюджет (TRY)",
      "leads.nameRequired":"Требуется ФИО.","leads.added":"Лид добавлен.","leads.noLeads":"Пока нет лидов.",
      "leads.statusUpdated":"Статус лида обновлён.",

      "customers.sub":"Список клиентов из лидов со статусом «выигран».","customers.noCustomers":"Пока нет клиентов со статусом «выигран».",

      "crm.sub":"Воронка продаж — распределение лидов по статусам в реальном времени.",
      "crm.note":"Внешняя синхронизация CRM (HubSpot/Salesforce/Zoho/Dynamics/Webhook) пока не подключена — нужен API-ключ провайдера. Этот экран сейчас показывает собственные внутренние CRM-данные VERALIQ (таблицу лидов).",

      "payments.sub":"Запросы на одобрение скидок / планов платежей.",
      "payments.ownerOnlyNote":"Право одобрения есть только у владельца компании (company_owner).","payments.decided":"Решение зафиксировано.",
      "payments.approve":"Одобрить","payments.reject":"Отклонить",

      "documents.sub":"Документы по проектам и договорам.",
      "documents.note":"<b>Этот экран пока не может загружать файлы.</b> В схеме базы данных готова таблица для метаданных документов, но реальное хранилище файлов (бакет Cloudflare R2) для этой компании ещё не настроено. Вместо фиктивной кнопки «загрузить» это честно указано здесь — после настройки бакета R2 экран будет подключён к реальной загрузке/скачиванию.",

      "calendar.sub":"Управление встречами и календарём.",
      "calendar.note":"<b>Инфраструктура встреч/календаря ещё не настроена.</b> В базе данных нет таблицы встреч — нужен отдельный этап разработки. Вместо фиктивных встреч здесь указано реальное положение дел.",

      "integrations.sub":"Внешние подключения CRM/ERP и других сервисов.",
      "integrations.note":"<b>Внешние интеграции (HubSpot/Salesforce/Zoho/Dynamics/WhatsApp Business API/платёжный провайдер) пока не подключены.</b> Каждая требует вашего API-ключа/аккаунта. Архитектура VERALIQ независима от провайдера, поэтому эти сервисы можно добавить, когда вы будете готовы.",

      "reports.sub":"Отчётность и экспорт в реальном времени на основе реальных данных.","reports.downloadCsv":"Скачать CSV",
      "reports.csvHeader":"показатель,значение","reports.csvFilename":"veraliq-otchet.csv",
      "reports.note":"v1: данные отчёта можно скачать в формате CSV. Экспорт в PDF и логотип компании — отдельный этап разработки.",

      "agents.sub":"Реальная эффективность показов AI-агентов и менеджеров-людей.",
      "agents.presentationNote":"проведённых показов (записи блокировки показа)",
      "agents.note":"Эти цифры рассчитаны на основе реальных записей блокировки показа в журнале аудита — это не оценочный показатель эффективности.",

      "team.sub":"Пользователи с доступом к порталу.","team.addBtn":"+ Добавить участника","team.tempPasswordLabel":"Временный пароль",
      "team.tempPasswordPlaceholder":"Не менее 8 символов","team.roleLabel":"Роль","team.allFieldsRequired":"Все поля обязательны.",
      "team.added":"Участник команды добавлен.","team.confirmRemove":"Вы уверены, что хотите удалить этого пользователя из команды?","team.removed":"Удалено.",

      "settings.sub":"Информация о компании и настройки аккаунта.","settings.companyInfo":"Информация о компании","settings.companyNameLabel":"Название компании",
      "settings.ownerOnlyHint":"Только владелец компании может изменять информацию о компании.","settings.changePasswordTitle":"Изменить пароль",
      "settings.currentPasswordLabel":"Текущий пароль","settings.newPasswordLabel":"Новый пароль","settings.changePasswordBtn":"Изменить пароль",
      "settings.bothFieldsRequired":"Оба поля обязательны.","settings.companyUpdated":"Информация о компании обновлена.",
      "settings.passwordUpdated":"Ваш пароль обновлён.","settings.exportTitle":"Экспорт ваших данных",
      "settings.exportHint":"ВСЕ данные вашей компании (проекты, юниты, лиды, клиенты, история переговоров, одобрения, журнал аудита) скачиваются в виде одного JSON-файла. Это гарантирует, что ваши данные всегда принадлежат вам.",
      "settings.exportBtn":"Скачать все мои данные (.json)","settings.preparing":"Подготовка…","settings.dataDownloaded":"Ваши данные скачаны.",

      "agentWidget.title":"Ассистент компании","agentWidget.halfScreen":"Половина экрана","agentWidget.fullScreen":"Полный экран",
      "agentWidget.minimize":"Свернуть","agentWidget.close":"Закрыть","agentWidget.preparing":"Ассистент готовится…",
      "agentWidget.micBlocked":"Доступ к микрофону не предоставлен. Ассистент вас не слышит — включите доступ в настройках браузера и обновите страницу. Вы также можете продолжить, печатая (меню AI-ассистента).",
      "agentWidget.joinBtn":"Присоединиться","agentWidget.joinHint":"Нажмите, чтобы использовать микрофон",
      "agentWidget.reopenBtn":"Открыть ассистента","agentWidget.expandAria":"Развернуть ассистента компании",

      "lang.switcherLabel":"Язык",

      "admin.nav.dashboard":"Панель","admin.nav.assistant":"AI-ассистент","admin.nav.agents":"Агенты","admin.nav.auditLog":"Журнал аудита"
    }
  }
};
