import fs from 'fs';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const hallidayData = JSON.parse(fs.readFileSync('./halliday_questions.json', 'utf-8'));

async function seedHallidayQuestions() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(dbUrl, { prepare: false });

  try {
    let inserted = 0;
    let skipped = 0;

    for (const category of hallidayData.categories) {
      for (const section of category.sections) {
        for (const question of section.questions) {
          try {
            const result = await sql`
              INSERT INTO halliday_questions (question_id, category, section, text, weight, difficulty)
              VALUES (${question.id}, ${category.id}, ${section.id}, ${question.text}, ${category.weight}, ${1})
              ON CONFLICT (question_id) DO NOTHING
            `;
            if (result.count > 0) inserted++;
            else skipped++;
          } catch (err) {
            console.warn(`  Skipping ${question.id}: ${err.message}`);
            skipped++;
          }
        }
      }
    }

    const [row] = await sql`SELECT COUNT(*) as count FROM halliday_questions`;
    console.log(`Seeded ${inserted} new questions (${skipped} already existed)`);
    console.log(`Total questions in database: ${row.count}`);
  } catch (error) {
    console.error('Error seeding questions:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seedHallidayQuestions();
