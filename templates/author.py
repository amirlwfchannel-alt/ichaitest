"""Regenerate the static demo HTML. Uses only existing local repository assets."""
from pathlib import Path
from html import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
IMAGES = sorted((ROOT / 'img/w640').glob('*.webp'))
FA = str.maketrans('0123456789,', '۰۱۲۳۴۵۶۷۸۹٬')
def fa(n):
    return str(n).translate(FA)

def photo(index, prefix='../../', **attrs):
    extra = ' '.join(f'{key}="{value}"' for key, value in attrs.items())
    return f'<img src="{prefix}img/w640/{IMAGES[index].name}" alt="" width="640" height="640" {extra}>'

PRODUCTS = [
    ('espresso', 'coffee', 'اسپرسو', 'یک فنجان کوتاه؛ طعم پررنگ قهوه با پایان شکلاتی.', 85000, 0, 'قهوهٔ گرم'),
    ('latte', 'coffee', 'لاته', 'اسپرسو، شیر گرم و لایه‌ای نرم از فوم شیر.', 125000, 2, 'حاوی شیر'),
    ('iced-latte', 'cold', 'آیس لاته', 'همان ترکیب آشنا، این بار خنک و روی یخ.', 130000, 11, 'حاوی شیر'),
    ('fruit', 'cold', 'نوشیدنی میوهٔ فصل', 'ترکیبی خنک از میوه‌های فصل، با شیرینی ملایم.', 95000, 13, 'نوشیدنی سرد'),
    ('tea', 'tea', 'چای بهارنارنج', 'چای سیاه ایرانی با رایحهٔ آرام بهارنارنج.', 65000, 22, 'بدون شیر'),
    ('chamomile', 'tea', 'دمنوش بابونه', 'بابونهٔ دم‌کشیده؛ انتخابی ساده برای یک مکث کوتاه.', 75000, 25, 'بدون قهوه'),
    ('tiramisu', 'sweet', 'تیرامیسو', 'لایه‌های لطیف قهوه، بیسکویت و کرم ماسکارپونه.', 155000, 29, 'شیر، تخم‌مرغ، گلوتن'),
    ('brownie', 'sweet', 'براونی شکلاتی', 'بافت نرم شکلات تلخ با تکه‌های گردو.', 125000, 30, 'گردو، شیر، گلوتن'),
]
THEMES = {
    'classic': dict(name='کافه روایت', latin='REVAYAT', number='۰۱', label='کلاسیک / گرم / تحریریه‌ای', eyebrow='یک فنجان، یک روایت تازه', title='بعضی لحظه‌ها،<br><em>آهسته‌تر</em> می‌گذرند.', intro='جایی میان عطر قهوه و ورق‌های یک کتاب. از منوی کوچک ما، به سلیقهٔ خودتان انتخاب کنید.', hero=0, tag='برای مکث‌های طولانی', heading='منوی روزِ روایت', storytitle='قصه، از یک میز کوچک شروع می‌شود.', story='روایت، یک هویت خیالی برای کافه‌ای آرام است؛ با منویی کوتاه، رنگ‌های کاغذ و قهوه، و فضایی برای گفت‌وگو. این صفحه نشان می‌دهد یک منوی دیجیتال هم می‌تواند حس ورق زدن دفتر محبوبتان را داشته باشد.', aside='پیشنهاد این فصل', pick='اسپرسو و براونی', note='تلخی قهوه کنار شیرینی شکلات؛ یک همراهی آشنا.'),
    'garden': dict(name='کافه برگ', latin='BARG', number='۰۲', label='باغ / روشن / گیاه‌محور', eyebrow='کمی سبز، کمی سکوت', title='یک نفس تازه،<br>یک فنجان <em>آرامش.</em>', intro='برای صبح‌های روشن و عصرهای بی‌عجله. طعم دلخواهتان را در میان قهوه، دمنوش و شیرینی پیدا کنید.', hero=22, tag='به سلیقهٔ روزهای روشن', heading='از باغچهٔ منوی ما', storytitle='قرارمان، یک گوشهٔ سبز.', story='برگ، یک کافهٔ خیالی با حال‌وهوای باغ است. فضای روشن و فرم‌های نرم، مجال نفس کشیدن به منو می‌دهند؛ هر انتخاب با توضیحی کوتاه، روشن و بی‌حاشیه همراه است.', aside='یک جفتِ دلنشین', pick='دمنوش و براونی', note='یک نوشیدنی گرم و تکه‌ای شیرینی؛ به اندازهٔ یک استراحت کوتاه.'),
    'midnight': dict(name='کافه نیمه‌شب', latin='NIMESHAB', number='۰۳', label='شب / تیره / معاصر', eyebrow='برای ساعت‌های خودت', title='شب ادامه دارد.<br><em>قهوه هم همین‌طور.</em>', intro='طعم‌های آشنا، با یک حال‌وهوای دیگر. انتخاب کن، ترکیب کن و سبد نمونهٔ خودت را بساز.', hero=2, tag='روشن به عطر قهوه', heading='انتخاب امشب', storytitle='شهر آرام می‌شود؛ گفت‌وگو نه.', story='نیمه‌شب، یک هویت نمایشی برای کافه‌ای با روح شهری است. زمینهٔ تیره، تایپوگرافی پررنگ و منوی فشرده، انتخاب را مستقیم و بی‌واسطه می‌کنند؛ برای کسانی که شب را دوست دارند.', aside='ترکیبِ امشب', pick='آیس لاته و تیرامیسو', note='قهوه در دو بافت؛ یکی خنک، یکی لطیف و شیرین.'),
}

def head(title, description, prefix='../', theme=''):
    return f'''<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{description}">
  <meta name="color-scheme" content="{'dark' if theme == 'midnight' else 'light'}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>{title}</title>
  <link rel="stylesheet" href="{prefix}../fonts/fonts.css">
  <link rel="stylesheet" href="{prefix}shared.css">
</head>'''

def card(p):
    id, cat, name, desc, price, image, tag = p
    return f'''<article class="menu-card" data-product-id="{id}" data-category="{cat}" data-name="{name}" data-price="{price}" aria-labelledby="name-{id}">
      <div class="product-image">{photo(image, loading='lazy', decoding='async')}</div>
      <div class="product-body"><span class="product-tag">{tag}</span><h3 id="name-{id}">{name}</h3><p class="product-description">{desc}</p>
      <div class="product-bottom"><p class="price"><strong>{fa(f'{price:,}')}</strong> <span>تومان</span></p><button type="button" class="add-button" data-add="{id}" disabled aria-label="افزودن {name} به سبد نمونه"><span aria-hidden="true">＋</span> افزودن</button></div></div>
    </article>'''

for theme, t in THEMES.items():
    folder = HERE / theme
    folder.mkdir(parents=True, exist_ok=True)
    categories = [('all', 'همهٔ منو'), ('coffee', 'قهوه'), ('cold', 'خنک‌ها'), ('tea', 'چای و دمنوش'), ('sweet', 'شیرینی')]
    filters = ''.join(f'<button type="button" data-category-filter="{c}" aria-pressed="{str(c == "all").lower()}">{n}</button>' for c,n in categories)
    cards = '\n'.join(card(p) for p in PRODUCTS)
    html = head(t['name'] + ' — قالب نمایشی منوی کافه', 'قالب فارسی و راست‌به‌چپ '+t['label']+'؛ منوی نمونه، جست‌وجو و سبد محلی بدون ثبت سفارش.', theme=theme) + f'''
<body class="theme-{theme}" data-demo="{theme}">
<a class="skip-link" href="#main">رفتن به محتوای اصلی</a>
<div class="demo-ribbon"><p>قالب نمایشی · هویت و قیمت‌ها نمونه‌اند</p><a href="../index.html">همهٔ قالب‌ها <span aria-hidden="true">↗</span></a></div>
<header class="site-header wrap">
  <a class="brand" href="#main" aria-label="{t['name']}، ابتدای صفحه"><span class="brand-mark" aria-hidden="true">{t['name'].replace('کافه ', '')[:1]}</span><span>{t['name']}<small lang="en" dir="ltr">{t['latin']} / DEMO</small></span></a>
  <nav aria-label="ناوبری اصلی"><a href="#menu">منو</a><a href="#story">حال‌وهوای ما</a></nav>
  <button class="cart-trigger" type="button" data-open-cart disabled aria-haspopup="dialog" aria-controls="demo-cart">سبد نمونه <span data-cart-count>۰</span></button>
</header>
<main id="main" tabindex="-1">
  <section class="hero wrap" aria-labelledby="hero-title">
    <div class="hero-copy"><p class="eyebrow">{t['eyebrow']}</p><h1 id="hero-title">{t['title']}</h1><p class="hero-intro">{t['intro']}</p><a class="primary-link" href="#menu">گشتی در منو <span aria-hidden="true">↙</span></a><p class="hero-note">{t['label']} <span aria-hidden="true"> / </span> طراحی فارسی</p></div>
    <figure class="hero-figure"><div class="photo-frame">{photo(t['hero'], fetchpriority='high', decoding='async')}</div><figcaption><span>{t['tag']}</span><small>عکس آرشیوی · نمایشی</small></figcaption><span class="photo-stamp" aria-hidden="true">{t['latin']}<br>قالب نمونه</span></figure>
  </section>
  <div class="menu-divider wrap" aria-hidden="true"><span>{t['latin']}</span><span>قهوه، چای، گفت‌وگو</span><span>منوی نمونه</span></div>
  <section class="menu-section wrap" id="menu" aria-labelledby="menu-title">
    <div class="section-heading"><div><p class="eyebrow">به سلیقهٔ شما</p><h2 id="menu-title">{t['heading']}</h2></div><p>تمام قیمت‌ها به تومان و صرفاً نمونه‌اند.<br>سفارش واقعی ثبت نمی‌شود.</p></div>
    <div class="menu-layout"><aside class="menu-sidebar"><div class="menu-tools" data-enhancement hidden>
      <div class="search-field"><label for="menu-search">جست‌وجو در منو</label><input id="menu-search" type="search" placeholder="مثلاً لاته یا شکلات" autocomplete="off" maxlength="100" aria-controls="menu-products"></div>
      <div class="category-filters" role="group" aria-label="دسته‌بندی منو">{filters}</div>
      <p class="result-count" id="result-count" role="status" aria-live="polite">۸ انتخاب در منو</p>
    </div><div class="pairing"><p class="eyebrow">{t['aside']}</p><h3>{t['pick']}</h3><p>{t['note']}</p><a href="#menu-products">دیدن انتخاب‌ها <span aria-hidden="true">↓</span></a></div></aside>
    <div class="menu-results"><div id="menu-products" class="menu-grid">{cards}</div><div id="empty-results" class="empty-results" hidden><h3>چیزی پیدا نشد.</h3><p>نام دیگری را امتحان کنید یا همهٔ منو را ببینید.</p><button type="button" class="secondary-button" data-reset-filters>پاک کردن جست‌وجو و فیلتر</button></div></div></div>
    <p class="image-disclaimer">تصاویر آرشیوی و نمایشی‌اند و ممکن است با آیتم مطابقت نداشته باشند. توضیحات مواد اولیه نیز نمونه‌اند؛ برای حساسیت غذایی به این دمو استناد نکنید.</p>
    <noscript><p class="noscript-note">منوی کامل بدون جاوااسکریپت در دسترس است. برای جست‌وجو و سبد نمونه، جاوااسکریپت را فعال کنید.</p></noscript>
  </section>
  <section class="story wrap" id="story" aria-labelledby="story-title"><p class="eyebrow">حال‌وهوای {t['name']}</p><div><h2 id="story-title">{t['storytitle']}</h2><p>{t['story']}</p></div><span class="story-word" lang="en" dir="ltr" aria-hidden="true">{t['latin']}</span></section>
</main>
<footer class="site-footer wrap"><div><strong>{t['name']}</strong><p>این کافه و منو صرفاً یک نمونهٔ طراحی هستند.<br>هیچ خرید، پرداخت یا رزروی انجام نمی‌شود.</p></div><nav aria-label="پیوندهای پایان صفحه"><a href="../index.html">بازگشت به گالری</a><a href="../../index.html">منوی اصلی پروژه</a><a href="#main">ابتدای صفحه ↑</a></nav></footer>
<p class="live-notice" id="cart-notice" role="status" aria-live="polite" aria-atomic="true"></p>
<dialog id="demo-cart" aria-labelledby="cart-title" aria-describedby="cart-description">
  <div class="dialog-heading"><div><p class="eyebrow">فقط روی همین مرورگر</p><h2 id="cart-title">سبد نمونهٔ شما</h2></div><button type="button" class="close-button" data-close-cart aria-label="بستن سبد نمونه" autofocus>×</button></div>
  <p id="cart-description">سفارش واقعی ثبت نمی‌شود. قیمت‌ها نمونه‌اند و هیچ اطلاعاتی به سرور ارسال نمی‌شود.</p>
  <p id="storage-note" class="storage-note" hidden>ذخیره‌سازی مرورگر در دسترس نیست؛ سبد فقط تا بستن این صفحه باقی می‌ماند.</p>
  <div id="cart-items"></div><p id="cart-empty">سبد هنوز خالی است. یک طعم به آن اضافه کنید.</p>
  <p class="cart-total">جمع نمونه <strong id="cart-total">۰ تومان</strong></p>
  <div class="dialog-actions"><button class="secondary-button" type="button" data-clear-cart disabled>خالی کردن سبد</button><button class="primary-button" type="button" data-close-cart>ادامهٔ گشتن در منو</button></div>
  <p id="cart-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
</dialog>
<script src="../model.js" defer></script><script src="../demo.js" defer></script>
</body>
</html>
'''
    (folder / 'index.html').write_text(html, encoding='utf-8')

previews = ''
for theme, t in THEMES.items():
    previews += f'''<article class="gallery-card preview-{theme}"><a class="gallery-preview" href="{theme}/index.html" aria-label="مشاهدهٔ قالب {t['name']}"><div class="mini-top"><span>{t['name']}</span><span lang="en" dir="ltr">{t['latin']}</span></div><div class="mini-composition"><div><p>{t['eyebrow']}</p><h2>{t['title']}</h2><span class="mini-cta">گشتی در منو ↙</span></div>{photo(t['hero'], prefix='../', loading='lazy', decoding='async')}</div><div class="mini-bottom"><span>قهوه</span><span>چای و دمنوش</span><span>شیرینی</span></div></a><div class="gallery-description"><div><p class="eyebrow">قالب {t['number']}</p><h3>{t['label']}</h3></div><p>{t['story'].split('؛')[0]}</p><a class="gallery-link" href="{theme}/index.html">کاوش در {t['name']} <span aria-hidden="true">↗</span></a></div></article>'''
html = head('سه حال‌وهوا برای یک فنجان — گالری قالب‌های کافه', 'سه قالب مستقل فارسی کافه: کلاسیک گرم، باغ روشن و نیمه‌شب مدرن. کاملاً محلی، بدون سفارش و پرداخت واقعی.', prefix='') + f'''
<body class="gallery-page">
<a class="skip-link" href="#main">رفتن به محتوای اصلی</a>
<header class="gallery-header wrap"><a href="../index.html" class="gallery-home">آی‌چای / آزمایشگاه قالب‌ها</a><span>فارسی · راست‌به‌چپ · مستقل</span></header>
<main id="main" tabindex="-1" class="wrap"><section class="gallery-intro"><p class="eyebrow">مجموعهٔ منوهای نمایشی</p><h1>سه حال‌وهوا.<br><em>یک فنجان فرصت.</em></h1><div><p>از گرمای کاغذ و قهوه تا روشنی باغ و سکوت شب؛ سه برداشت متفاوت از یک منوی دیجیتال. هر قالب را باز کنید و انتخاب کردن را امتحان کنید.</p><p class="gallery-disclaimer">هویت و قیمت‌ها نمونه‌اند. سفارش واقعی ثبت نمی‌شود.</p></div></section><section class="gallery-grid" aria-label="قالب‌های قابل مشاهده">{previews}</section><section class="gallery-details" aria-labelledby="details-title"><h2 id="details-title">زیبا، اما فقط یک تصویر نیست.</h2><p>منوها بدون جاوااسکریپت هم خوانا هستند. با فعال بودن آن، جست‌وجوی فارسی، فیلتر دسته‌بندی و سبد نمونه را امتحان کنید. سبد هر قالب مستقل و فقط در مرورگر شما ذخیره می‌شود؛ بدون حساب کاربری، پرداخت یا ارتباط با سرور.</p><p>تمام فونت‌ها و تصاویر از فایل‌های محلی همین پروژه بارگیری می‌شوند. تصاویر، آرشیوی و نمایشی هستند.</p></section></main><footer class="gallery-footer wrap"><p>طراحی برای گشتن، انتخاب کردن و مقایسه.</p><nav aria-label="پیوندهای گالری"><a href="../index.html">بازگشت به منوی اصلی ↗</a></nav></footer>
</body></html>'''
(HERE / 'index.html').write_text(html, encoding='utf-8')
print('Authored: gallery + 3 static menus, 8 products each; local assets only.')
