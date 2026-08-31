# کافه آی‌چای — منوی دیجیتال

یک وب‌سایت مدرن، لوکس و تمام‌عیار برای نمایش منوی کافه به همراه پنل مدیریت.

## ساختار پروژه

```
kafe-aichai-1/
├── index.html          # صفحه منوی عمومی (نمایشی)
├── admin.html          # پنل مدیریت
├── css/
│   ├── main.css        # استایل‌های صفحه منو
│   └── admin.css       # استایل‌های پنل مدیریت
├── js/
│   ├── data.js         # داده‌های پیش‌فرض (دسته‌بندی‌ها، محصولات، اطلاعات کافه)
│   ├── utils.js        # توابع کمکی (فرمت قیمت، اعداد فارسی، localStorage)
│   ├── app.js          # منطق صفحه منو (Alpine.js)
│   └── admin.js        # منطق پنل مدیریت (Alpine.js)
├── assets/
│   └── images/         # تصاویر (اختیاری — از URL استفاده می‌شود)
└── README.md
```

## اجرا

کافیست فایل‌ها را در یک وب‌سرور سرو کنید یا `index.html` را مستقیماً در مرورگر باز کنید.

```bash
# با Python
python3 -m http.server 8000

# سپس در مرورگر:
# http://localhost:8000/index.html
# http://localhost:8000/admin.html
```

## ادغام با Django

### ۱. کپی فایل‌های استاتیک

فایل‌ها را در پوشه `static` پروژه Django خود قرار دهید:

```
your_django_project/
├── your_app/
│   ├── static/
│   │   └── cafe/
│   │       ├── css/
│   │       │   ├── main.css
│   │       │   └── admin.css
│   │       ├── js/
│   │       │   ├── data.js
│   │       │   ├── utils.js
│   │       │   ├── app.js
│   │       │   └── admin.js
│   │       └── assets/
│   │           └── images/
│   ├── templates/
│   │   └── cafe/
│   │       ├── index.html
│   │       └── admin.html
│   ├── views.py
│   └── urls.py
```

### ۲. تنظیمات Django

در `settings.py`:

```python
STATIC_URL = '/static/'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]
```

### ۳. ویوها

در `views.py`:

```python
from django.shortcuts import render

def menu_view(request):
    return render(request, 'cafe/index.html')

def admin_view(request):
    return render(request, 'cafe/admin.html')
```

### ۴. URLها

در `urls.py`:

```python
from django.urls import path
from . import views

urlpatterns = [
    path('', views.menu_view, name='menu'),
    path('admin-panel/', views.admin_view, name='admin-panel'),
]
```

### ۵. آپدیت مسیرها

در فایل‌های HTML، مسیرهای CSS و JS را با `{% static %}` تگ جایگزین کنید:

```html
<!-- قبل -->
<link rel="stylesheet" href="css/main.css">
<script src="js/app.js"></script>

<!-- بعد -->
{% load static %}
<link rel="stylesheet" href="{% static 'cafe/css/main.css' %}">
<script src="{% static 'cafe/js/app.js' %}"></script>
```

## فناوری‌ها

- **Tailwind CSS v3.4** (Play CDN)
- **Alpine.js v3**
- **Vazirmatn** (فونت فارسی از Google Fonts)
- بدون نیاز به build step یا npm

## ویژگی‌ها

### صفحه منو (index.html)
- طرح تاریک لوکس با تم مشکی، طلایی و قهوه‌ای
- بخش Hero تمام‌صفحه با انیمیشن
- نوار ناوبری چسبان با جستجو
- فیلتر دسته‌بندی با چیپ‌های قابل کلیک
- شبکه محصولات واکنش‌گرا (۱ تا ۴ ستون)
- بارگذاری تنبل تصاویر
- اعداد و قیمت‌های فارسی
- علاقه‌مندی‌ها (ذخیره در localStorage)
- انیمیشن‌های ورودی و تعاملات ظریف
- حالت خالی زیبا
- RTL کامل

### پنل مدیریت (admin.html)
- داشبورد با آمار
- مدیریت محصولات (CRUD کامل)
- مدیریت دسته‌بندی‌ها (CRUD کامل)
- مدیریت محتوای کافه
- سفارشات (دمو)
- تنظیمات (تم، خروجی/ورودی، بازنشانی)
- مرتب‌سازی با Drag & Drop
- جدول‌های قابل جستجو
- پیش‌نمایش تصویر از URL
- حالت تاریک/روشن
- اعلان‌های Toast

## مجوز

رایگان و آزاد برای استفاده.

---

طراحی و توسعه توسط [amirlwf](https://amirlwf.ir)
