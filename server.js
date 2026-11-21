const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://app:app@db:5432/app'
});

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function formatCurrentDate() {
    const now = new Date();
    return `${now.toLocaleDateString('ru-RU')} - ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

async function initDatabase(retries = 15, delayMs = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS words (
                    id SERIAL PRIMARY KEY,
                    word VARCHAR(255) NOT NULL,
                    translation VARCHAR(255) NOT NULL,
                    example TEXT NOT NULL DEFAULT '',
                    created_at VARCHAR(64) NOT NULL
                );
            `);
            console.log('Database connected and schema is ready.');
            return;
        } catch (err) {
            console.log(`Waiting for PostgreSQL (attempt ${attempt}/${retries}): ${err.message}`);
            if (attempt === retries) {
                throw err;
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
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
                <p><strong>Версия 0.0.3</strong></p>
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
app.get('/words', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, word, translation, example, created_at FROM words ORDER BY id ASC'
        );
        const words = result.rows;

        const cards = words.length > 0
            ? words.map((w) => `
                <div style="background:white; padding:20px; margin-bottom:15px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05); text-align:left;">
                    <h3>${w.word} — ${w.translation}</h3>
                    <p>Пример: ${w.example}</p>
                    <small>Добавлено: ${w.created_at}</small>
                    <br><a href="/words/${w.id}" style="color:#0d9488; font-weight:bold; text-decoration:none;">Открыть карточку &rarr;</a>
                </div>
            `).join('')
            : '<p style="background:white; padding:20px; border-radius:8px; color:#475569;">Список слов пока пуст. Добавьте первую запись через форму.</p>';

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
    } catch (err) {
        console.error('Error loading words:', err);
        res.redirect('/action-error?reason=db_error');
    }
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

// Обработка отправки формы (создание записи в PostgreSQL)
app.post('/words', async (req, res) => {
    const { word, translation, example } = req.body;

    if (!word || !translation || word.trim() === '' || translation.trim() === '') {
        return res.redirect('/action-error?reason=empty_fields');
    }

    try {
        const cleanWord = word.trim();
        const cleanTranslation = translation.trim();
        const cleanExample = example ? example.trim() : '';
        const createdAt = formatCurrentDate();

        const insertResult = await pool.query(
            `INSERT INTO words (word, translation, example, created_at)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [cleanWord, cleanTranslation, cleanExample, createdAt]
        );

        const newId = insertResult.rows[0].id;
        res.redirect(`/words/${newId}`);
    } catch (err) {
        console.error('Error inserting word:', err);
        res.redirect('/action-error?reason=db_error');
    }
});

// 4. Карточка отдельного слова (/words/:id)
app.get('/words/:id', async (req, res) => {
    const wordId = Number(req.params.id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
        return res.redirect('/action-error?reason=not_found');
    }

    try {
        const result = await pool.query(
            'SELECT id, word, translation, example, created_at FROM words WHERE id = $1',
            [wordId]
        );
        const word = result.rows[0];

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
                    <small>Добавлено: ${word.created_at}</small>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error fetching word detail:', err);
        res.redirect('/action-error?reason=db_error');
    }
});

// 5. Страница отказа / ошибочный сценарий (/action-error)
app.get('/action-error', (req, res) => {
    let reason = 'Обязательные поля (слово и перевод) не могут быть пустыми.';
    if (req.query.reason === 'not_found') {
        reason = 'Запрашиваемое слово не найдено в базе данных.';
    } else if (req.query.reason === 'db_error') {
        reason = 'Ошибка при обращении к базе данных.';
    }

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

initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });