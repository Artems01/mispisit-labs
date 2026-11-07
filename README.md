# WordMaster — помощник по изучению иностранных слов

Первая страница проекта WordMaster для лабораторной работы №1.

## Локальный запуск

```bash
npm install
npm start
```

Откройте в браузере: http://localhost:8080

## Сборка и запуск Docker

```bash
docker build -t wordmaster:0.0.1 .
docker run --rm -p 8080:8080 wordmaster:0.0.1
```

Откройте в браузере: http://localhost:8080

## Проверка состояния

Откройте http://localhost:8080/health
