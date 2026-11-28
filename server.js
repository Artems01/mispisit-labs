const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = '0.0.5';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://app:app@db:5432/app'
});

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCurrentDate() {
    const now = new Date();
    return `${now.toLocaleDateString('ru-RU')} - ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

async function getUnreadNotificationsCount() {
    const res = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM word_notifications WHERE read_at IS NULL'
    );
    return res.rows[0]?.cnt ?? 0;
}

function renderLayout({ title, activeNav, unreadCount = 0, content }) {
    const navClass = (key) => (activeNav === key ? ' class="active"' : '');
    const badgeText = unreadCount > 0 ? ` (${unreadCount})` : '';

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} — WordMaster (v${APP_VERSION})</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header class="topbar">
        <div class="topbar-inner">
            <a href="/" class="brand">
                <span>WordMaster</span>
                <span class="version-badge">v${APP_VERSION}</span>
            </a>
            <nav class="nav" aria-label="Основная навигация">
                <a href="/"${navClass('home')}>Главная</a>
                <a href="/words"${navClass('words')}>Лента слов</a>
                <a href="/words/new"${navClass('new')}>Добавить слово</a>
                <a href="/notifications"${navClass('notifications')}>Уведомления${escapeHtml(badgeText)}</a>
                <a href="/action-error"${navClass('error')}>Пример отказа</a>
            </nav>
        </div>
    </header>

    <main class="container">
        ${content}
    </main>

    <footer class="footer">
        <div class="footer-inner">
            <span>WordMaster — учебный словарь</span>
            <span>Версия ${APP_VERSION}</span>
        </div>
    </footer>
</body>
</html>`;
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
            await pool.query(`
                CREATE TABLE IF NOT EXISTS word_notifications (
                    id SERIAL PRIMARY KEY,
                    word_id INTEGER NOT NULL UNIQUE REFERENCES words(id) ON DELETE CASCADE,
                    event_type VARCHAR(64) NOT NULL DEFAULT 'word_added',
                    created_at VARCHAR(64) NOT NULL,
                    read_at VARCHAR(64) NULL
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
app.get('/', async (req, res) => {
    const unreadCount = await getUnreadNotificationsCount().catch(() => 0);
    const html = renderLayout({
        title: 'Главная',
        activeNav: 'home',
        unreadCount,
        content: `
            <section class="panel hero">
                <span class="version-badge">Версия ${APP_VERSION}</span>
                <h1>WordMaster</h1>
                <p>Личный словарь для изучения иностранных слов: сохраняйте новые слова, отслеживайте уведомления о добавлении и просматривайте карточки в базе данных.</p>
                <div class="actions">
                    <a href="/words" class="btn btn-primary">Лента слов</a>
                    <a href="/words/new" class="btn btn-secondary">Добавить слово</a>
                    <a href="/notifications" class="btn btn-secondary">Уведомления</a>
                    <a href="/action-error" class="btn btn-secondary">Страница отказа</a>
                </div>
            </section>
        `
    });
    res.send(html);
});

// 2. Просмотр списка слов (/words)
app.get('/words', async (req, res) => {
    try {
        const unreadCount = await getUnreadNotificationsCount();
        const result = await pool.query(
            'SELECT id, word, translation, example, created_at FROM words ORDER BY id ASC'
        );
        const words = result.rows;

        const listMarkup = words.length > 0
            ? words.map((w) => `
                <article class="word-card">
                    <h2>${escapeHtml(w.word)} — ${escapeHtml(w.translation)}</h2>
                    <p class="word-example">${escapeHtml(w.example || 'Пример не указан')}</p>
                    <div class="word-meta">
                        <span>Добавлено: ${escapeHtml(w.created_at)}</span>
                        <a href="/words/${w.id}" class="btn btn-secondary">Открыть карточку &rarr;</a>
                    </div>
                </article>
            `).join('')
            : `
                <section class="empty-state">
                    <h2>Слов пока нет</h2>
                    <p>В словаре ещё нет записей. Добавьте первое слово, чтобы оно появилось в списке и сохранилось в базе.</p>
                    <a href="/words/new" class="btn btn-primary">+ Добавить первое слово</a>
                </section>
            `;

        const html = renderLayout({
            title: 'Лента слов',
            activeNav: 'words',
            unreadCount,
            content: `
                <div class="page-header">
                    <h1>Лента слов (${words.length})</h1>
                    <a href="/words/new" class="btn btn-primary">+ Добавить слово</a>
                </div>
                ${listMarkup}
            `
        });
        res.send(html);
    } catch (err) {
        console.error('Error loading words:', err);
        res.redirect('/action-error?reason=db_error');
    }
});

// 3. Форма добавления слова (/words/new)
app.get('/words/new', async (req, res) => {
    const unreadCount = await getUnreadNotificationsCount().catch(() => 0);
    const html = renderLayout({
        title: 'Добавить слово',
        activeNav: 'new',
        unreadCount,
        content: `
            <div class="page-header">
                <h1>Добавить новое слово</h1>
                <a href="/words" class="btn btn-secondary">&larr; К ленте слов</a>
            </div>
            <section class="panel">
                <form action="/words" method="POST">
                    <div class="form-group">
                        <label for="word">Иностранное слово *</label>
                        <input id="word" type="text" name="word" placeholder="Например: Resilience">
                    </div>
                    <div class="form-group">
                        <label for="translation">Перевод *</label>
                        <input id="translation" type="text" name="translation" placeholder="Например: Устойчивость">
                    </div>
                    <div class="form-group">
                        <label for="example">Пример использования</label>
                        <textarea id="example" name="example" placeholder="Короткий пример предложения (необязательно)"></textarea>
                    </div>
                    <div class="actions" style="justify-content: flex-start;">
                        <button type="submit" class="btn btn-primary">Сохранить слово</button>
                        <a href="/words" class="btn btn-secondary">Отмена</a>
                    </div>
                </form>
            </section>
        `
    });
    res.send(html);
});

// Обработка отправки формы (создание записи и уведомления в PostgreSQL)
app.post('/words', async (req, res) => {
    const { word, translation, example } = req.body;

    if (!word || !translation || word.trim() === '' || translation.trim() === '') {
        return res.redirect('/action-error?reason=empty_fields');
    }

    const client = await pool.connect();
    try {
        const cleanWord = word.trim();
        const cleanTranslation = translation.trim();
        const cleanExample = example ? example.trim() : '';
        const createdAt = formatCurrentDate();

        await client.query('BEGIN');
        const insertResult = await client.query(
            `INSERT INTO words (word, translation, example, created_at)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [cleanWord, cleanTranslation, cleanExample, createdAt]
        );
        const newId = insertResult.rows[0].id;

        await client.query(
            `INSERT INTO word_notifications (word_id, event_type, created_at, read_at)
             VALUES ($1, 'word_added', $2, NULL)`,
            [newId, createdAt]
        );
        await client.query('COMMIT');

        res.redirect(`/words/${newId}`);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error inserting word and notification:', err);
        res.redirect('/action-error?reason=db_error');
    } finally {
        client.release();
    }
});

// 4. Карточка отдельного слова (/words/:id)
app.get('/words/:id', async (req, res) => {
    const wordId = Number(req.params.id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
        return res.redirect('/action-error?reason=not_found');
    }

    try {
        const unreadCount = await getUnreadNotificationsCount();
        const result = await pool.query(
            'SELECT id, word, translation, example, created_at FROM words WHERE id = $1',
            [wordId]
        );
        const word = result.rows[0];

        if (!word) {
            return res.redirect('/action-error?reason=not_found');
        }

        const html = renderLayout({
            title: `Слово: ${word.word}`,
            activeNav: 'words',
            unreadCount,
            content: `
                <div class="page-header">
                    <h1>Карточка слова №${word.id}</h1>
                    <a href="/words" class="btn btn-secondary">&larr; К ленте слов</a>
                </div>
                <section class="panel">
                    <span class="version-badge">Запись #${word.id}</span>
                    <h2 style="margin: 12px 0 6px; font-size: 28px;">${escapeHtml(word.word)}</h2>
                    <p style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: var(--primary-hover);">
                        ${escapeHtml(word.translation)}
                    </p>
                    <p style="margin: 0 0 16px; color: var(--muted);">
                        <strong>Пример:</strong> ${escapeHtml(word.example || 'Пример не указан')}
                    </p>
                    <p style="margin: 0; font-size: 13px; color: var(--muted);">
                        Добавлено: ${escapeHtml(word.created_at)}
                    </p>
                </section>
            `
        });
        res.send(html);
    } catch (err) {
        console.error('Error fetching word detail:', err);
        res.redirect('/action-error?reason=db_error');
    }
});

// 5. Экран уведомлений (/notifications)
app.get('/notifications', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                n.id,
                n.word_id,
                n.event_type,
                n.created_at,
                n.read_at,
                w.word,
                w.translation
            FROM word_notifications n
            JOIN words w ON w.id = n.word_id
            ORDER BY n.id DESC
        `);
        const items = result.rows;
        const unreadCount = items.filter((item) => !item.read_at).length;

        const listMarkup = items.length > 0
            ? items.map((item) => {
                const isUnread = !item.read_at;
                const statusLabel = isUnread ? 'Новое' : `Прочитано (${item.read_at})`;
                return `
                    <article class="word-card">
                        <div class="word-meta" style="margin-bottom: 8px;">
                            <span class="version-badge">${escapeHtml(statusLabel)}</span>
                            <span>${escapeHtml(item.created_at)}</span>
                        </div>
                        <h2>Слово добавлено: ${escapeHtml(item.word)} — ${escapeHtml(item.translation)}</h2>
                        <p class="word-example">Связанная запись: слово #${item.word_id} (событие: ${escapeHtml(item.event_type)})</p>
                        <div class="word-meta">
                            <a href="/words/${item.word_id}" class="btn btn-secondary">Открыть карточку &rarr;</a>
                            ${isUnread ? `
                                <form action="/notifications/${item.id}/read" method="POST" style="display: inline;">
                                    <button type="submit" class="btn btn-primary">Отметить прочитанным</button>
                                </form>
                            ` : ''}
                        </div>
                    </article>
                `;
            }).join('')
            : `
                <section class="empty-state">
                    <h2>Уведомлений пока нет</h2>
                    <p>После успешного добавления нового слова здесь появится уведомление со ссылкой на запись.</p>
                    <a href="/words/new" class="btn btn-primary">+ Добавить слово</a>
                </section>
            `;

        const html = renderLayout({
            title: 'Уведомления',
            activeNav: 'notifications',
            unreadCount,
            content: `
                <div class="page-header">
                    <h1>Уведомления (непрочитанных: ${unreadCount})</h1>
                    <a href="/words/new" class="btn btn-primary">+ Добавить слово</a>
                </div>
                ${listMarkup}
            `
        });
        res.send(html);
    } catch (err) {
        console.error('Error loading notifications:', err);
        res.redirect('/action-error?reason=db_error');
    }
});

// Отметка уведомления как прочитанного (POST /notifications/:id/read)
app.post('/notifications/:id/read', async (req, res) => {
    const notifId = Number(req.params.id);
    if (!Number.isInteger(notifId) || notifId <= 0) {
        return res.redirect('/action-error?reason=not_found');
    }

    try {
        const readAt = formatCurrentDate();
        await pool.query(
            `UPDATE word_notifications
             SET read_at = $1
             WHERE id = $2 AND read_at IS NULL`,
            [readAt, notifId]
        );
        res.redirect('/notifications');
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.redirect('/action-error?reason=db_error');
    }
});

// 6. Страница отказа / ошибочный сценарий (/action-error)
app.get('/action-error', async (req, res) => {
    const unreadCount = await getUnreadNotificationsCount().catch(() => 0);
    let reason = 'Обязательные поля (слово и перевод) не заполнены.';
    if (req.query.reason === 'not_found') {
        reason = 'Запрашиваемая запись не найдена в базе данных.';
    } else if (req.query.reason === 'db_error') {
        reason = 'Ошибка при обращении к базе данных PostgreSQL.';
    }

    const html = renderLayout({
        title: 'Отказ в выполнении',
        activeNav: 'error',
        unreadCount,
        content: `
            <section class="panel error-panel">
                <span class="error-tag">ОШИБКА 400</span>
                <h1 style="margin: 0 0 8px;">Действие отклонено</h1>
                <p style="margin: 0; color: var(--muted);">Система не выполнила запрос. Проверьте причину и повторите действие.</p>
                <div class="error-reason">Причина отказа: ${escapeHtml(reason)}</div>
                <p style="margin: 0 0 6px;"><strong>Пользователь:</strong> Пользователь системы</p>
                <p style="margin: 0;"><strong>Операция:</strong> Работа со словарём</p>
                <div class="actions" style="justify-content: flex-start;">
                    <a href="/words/new" class="btn btn-primary">Вернуться к форме</a>
                    <a href="/words" class="btn btn-secondary">К ленте слов</a>
                    <a href="/" class="btn btn-secondary">На главную</a>
                </div>
            </section>
        `
    });
    res.send(html);
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