import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const hallidayData = JSON.parse(fs.readFileSync('./halliday_questions.json', 'utf-8'));

async function seedHallidayQuestions() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const connection = await mysql.createConnection(dbUrl);

  try {
    let inserted = 0;
    let skipped = 0;

    for (const category of hallidayData.categories) {
      for (const section of category.sections) {
        for (const question of section.questions) {
          try {
            const [result] = await connection.execute(
              `INSERT IGNORE INTO halliday_questions (questionId, category, section, text, weight, difficulty) 
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                question.id,
                category.id,
                section.id,
                question.text,
                category.weight,
                1,
              ]
            );
            if (result.affectedRows > 0) inserted++;
            else skipped++;
          } catch (err) {
            console.warn(`  ⚠️  Skipping ${question.id}: ${err.message}`);
            skipped++;
          }
        }
      }
    }

    // Verify count
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM halliday_questions');
    console.log(`✅ Seeded ${inserted} new questions (${skipped} already existed)`);
    console.log(`📊 Total questions in database: ${rows[0].count}`);
  } catch (error) {
    console.error('❌ Error seeding questions:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

seedHallidayQuestions();
