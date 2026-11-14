const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'data', 'words.json');

// Middleware для чтения данных из форм и статики
app.use(express.urlencoded({ extended: true }));
app.use(express.express?.static ? express.static(path.join(__dirname, 'public')) : express.static('public'));

// Функция чтения слов из JSON
function getWords() {
    if (!fs.existsSync(DATA_FILE)) {
        const initial = [{
            id: 1,
            word: "Resilience",
            translation: "Устойчивость",
            example: "System resilience is critical.",
            date: "04.11.2026 - 12:58"
        }];
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
}

// 1. Главная страница (/)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>WordMaster - Главная</title>
            <style>
                body { font-family: Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px; text-align: center; }
                .card { background: white; max-width: 600px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                h1 { color: #0f172a; }
                .btn { display: inline-block; margin: 10px; padding: 12px 24px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
                .btn-secondary { background: #475569; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>WordMaster</h1>
                <p>Помощник по изучению иностранных слов: создавайте личный словарь, повторяйте слова и проверяйте свои знания.</p>
                <p><strong>Версия 0.0.2</strong></p>
                <div style="margin-top: 30px;">
                    <a href="/words" class="btn">Лента слов</a>
                    <a href="/words/new" class="btn">Добавить слово</a>
                    <a href="/action-error" class="btn btn-secondary">Пример отказа</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 2. Просмотр списка слов (/words)
app.get('/words', (req, res) => {
    const words = getWords();
    const cards = words.map(w => `
        <div style="background:white; padding:20px; margin-bottom:15px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05); text-align:left;">
            <h3>${w.word} — ${w.translation}</h3>
            <p>Пример: ${w.example}</p>
            <small>Добавлено: ${w.date}</small>
            <br><a href="/words/${w.id}" style="color:#0d9488; font-weight:bold; text-decoration:none;">Открыть карточку &rarr;</a>
        </div>
    `).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8"><title>WordMaster - Лента слов</title>
            <style>body { font-family: Arial, sans-serif; background: #f8fafc; padding: 30px; max-width: 800px; margin: 0 auto; }</style>
        </head>
        <body>
            <nav style="margin-bottom: 20px;"><a href="/">&larr; На главную</a> | <a href="/words/new">+ Добавить слово</a></nav>
            <h1>Лента слов (${words.length})</h1>
            ${cards}
        </body>
        </html>
    `);
});

// 3. Форма добавления слова (/words/new)
app.get('/words/new', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8"><title>WordMaster - Добавить слово</title>
            <style>body { font-family: Arial, sans-serif; background: #f8fafc; padding: 30px; max-width: 500px; margin: 0 auto; }</style>
        </head>
        <body>
            <nav style="margin-bottom: 20px;"><a href="/">&larr; На главную</a> | <a href="/words">К ленте</a></nav>
            <h1>Добавить новое слово</h1>
            <form action="/words" method="POST" style="background:white; padding:25px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="margin-bottom:15px;">
                    <label>Иностранное слово:</label><br>
                    <input type="text" name="word" style="width:100%; padding:8px; margin-top:5px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:15px;">
                    <label>Перевод:</label><br>
                    <input type="text" name="translation" style="width:100%; padding:8px; margin-top:5px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:15px;">
                    <label>Пример использования:</label><br>
                    <textarea name="example" style="width:100%; padding:8px; margin-top:5px; box-sizing:border-box; height:80px;"></textarea>
                </div>
                <button type="submit" style="background:#0d9488; color:white; padding:10px 20px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Сохранить</button>
            </form>
        </body>
        </html>
    `);
});

// Обработка отправки формы (создание данных с проверкой ошибок)
app.post('/words', (req, res) => {
    const { word, translation, example } = req.body;
    
    // Ошибочный сценарий: если поля пустые
    if (!word || !translation || word.trim() === '' || translation.trim() === '') {
        return res.redirect('/action-error?reason=empty_fields');
    }

    const words = getWords();
    const newEntry = {
        id: words.length > 0 ? words[words.length - 1].id + 1 : 1,
        word: word.trim(),
        translation: translation.trim(),
        example: example ? example.trim() : '',
        date: new Date().toLocaleDateString('ru-RU') + ' - ' + new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})
    };

    words.push(newEntry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(words, null, 2));
    res.redirect(`/words/${newEntry.id}`);
});

// 4. Карточка отдельного слова (/words/:id)
app.get('/words/:id', (req, res) => {
    const words = getWords();
    const word = words.find(w => w.id == req.params.id);

    if (!word) {
        return res.redirect('/action-error?reason=not_found');
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8"><title>WordMaster - Карточка слова</title>
            <style>body { font-family: Arial, sans-serif; background: #f8fafc; padding: 30px; max-width: 600px; margin: 0 auto; }</style>
        </head>
        <body>
            <nav style="margin-bottom: 20px;"><a href="/words">&larr; К ленте слов</a> | <a href="/">На главную</a></nav>
            <div style="background:white; padding:30px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <span style="background:#ccfbf1; color:#0f766e; padding:4px 8px; border-radius:4px; font-size:12px;">Слово №${word.id}</span>
                <h1 style="margin-top:10px;">${word.word}</h1>
                <h2>Перевод: ${word.translation}</h2>
                <p><strong>Пример:</strong> ${word.example || 'Нет примера'}</p>
                <small>Добавлено: ${word.date}</small>
            </div>
        </body>
        </html>
    `);
});

// 5. Страница отказа / ошибочный сценарий (/action-error)
app.get('/action-error', (req, res) => {
    const reason = req.query.reason === 'not_found' 
        ? 'Запрашиваемое слово не найдено в базе данных.' 
        : 'Обязательные поля (слово и перевод) не могут быть пустыми.';

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8"><title>WordMaster - Ошибка</title>
            <style>body { font-family: Arial, sans-serif; background: #f8fafc; padding: 30px; max-width: 600px; margin: 0 auto; }</style>
        </head>
        <body>
            <nav style="margin-bottom: 20px;"><a href="/">&larr; На главную</a></nav>
            <div style="background:white; border-left: 6px solid #ef4444; padding:30px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h2 style="color:#dc2626; margin-top:0;">Ошибка 400: Действие отклонено</h2>
                <p>Система не приняла данные. Посмотрите причину и попробуйте ещё раз.</p>
                <hr style="border:0; border-top:1px solid #e2e8f0; margin: 20px 0;">
                <p><strong>Кто:</strong> Пользователь системы</p>
                <p><strong>Попытка:</strong> Сохранение или поиск записи</p>
                <p><strong>Причина отказа:</strong> ${reason}</p>
                <div style="margin-top:25px;">
                    <a href="/words/new" style="background:#0d9488; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold; margin-right:10px;">Вернуться к форме</a>
                    <a href="/words" style="background:#475569; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold;">К ленте слов</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});