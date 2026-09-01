/**
 * A lesson run deals its own quota plus half again in review, and the plan
 * that decides which leaf each hand comes from is pure — no sidecar, no
 * network — so it can be checked exhaustively rather than sampled.
 *
 * Two properties matter and neither is visible from reading one run:
 *
 *  - every lesson deals `quizCount` of its own hands plus
 *    `ceil(1.5 x quizCount)` review hands, so the lesson's own material is
 *    always present in full however much review is stacked around it;
 *  - the lesson's own leaves are covered evenly. Independent sampling is
 *    what dealt a three-hand Lesson 5 two 2C hands and one 2NT, leaving half
 *    the lesson unexercised.
 *
 * Run:  npm run test:plans
 */
import {
  biddingCurriculum,
  buildLessonPlan,
  lessonHandCount,
  reviewHandCount,
  reviewLeavesFor,
  type BidLesson,
} from "../src/lib/biddingCurriculum";

const RUNS = Number(process.env.RUNS ?? 400);

/** Seeded so a failure is reproducible; Math.random would not be. */
function makeRand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function spread(plan: string[], lesson: BidLesson): number {
  const per = new Map<string, number>();
  for (const id of lesson.leaves) per.set(id, 0);
  for (const id of plan) {
    if (per.has(id)) per.set(id, per.get(id)! + 1);
  }
  const counts = [...per.values()];
  return Math.max(...counts) - Math.min(...counts);
}

function main(): void {
  const failures: string[] = [];
  const rand = makeRand(20260902);

  for (const lesson of biddingCurriculum.lessons) {
    const pool = reviewLeavesFor(lesson);
    const expected = lessonHandCount(lesson);

    // Lesson 1 has nothing behind it, so it stays at its own count.
    const wanted =
      lesson.quizCount +
      (pool.length === 0 ? 0 : Math.ceil(lesson.quizCount * 1.5));
    if (expected !== wanted) {
      failures.push(`${lesson.id}: hand count ${expected}, expected ${wanted}`);
    }

    for (let run = 0; run < RUNS; run += 1) {
      const plan = buildLessonPlan(lesson, rand);
      if (plan.length !== expected) {
        failures.push(
          `${lesson.id} run ${run}: ${plan.length} hands, expected ${expected}`,
        );
        break;
      }
      const own = plan.filter((id) => lesson.leaves.includes(id)).length;
      if (own !== lesson.quizCount) {
        failures.push(
          `${lesson.id} run ${run}: ${own} of its own hands, expected ${lesson.quizCount}`,
        );
        break;
      }
      if (!lesson.leaves.includes(plan[0]!)) {
        failures.push(
          `${lesson.id} run ${run}: opens on ${plan[0]}, which this lesson does not teach`,
        );
        break;
      }
      // Even coverage: a leaf may appear once more than another only when the
      // quota does not divide by the number of leaves.
      const allowed = lesson.quizCount % lesson.leaves.length === 0 ? 0 : 1;
      const seen = spread(plan, lesson);
      if (seen > allowed) {
        failures.push(
          `${lesson.id} run ${run}: own leaves dealt ${seen} apart, allowed ${allowed} — ${plan.join(" ")}`,
        );
        break;
      }
      for (const id of plan) {
        if (!lesson.leaves.includes(id) && !pool.includes(id)) {
          failures.push(`${lesson.id} run ${run}: ${id} is neither taught here nor earlier`);
          break;
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`lesson plans are wrong in ${failures.length} place(s):`);
    for (const f of failures.slice(0, 15)) console.error(`  ${f}`);
    process.exit(1);
  }

  const total = biddingCurriculum.lessons.reduce(
    (n, l) => n + lessonHandCount(l),
    0,
  );
  const thin = biddingCurriculum.lessons.filter(
    (l) => reviewHandCount(l) > reviewLeavesFor(l).length * 2,
  );
  for (const l of thin) {
    console.warn(
      `note  ${l.id} draws ${reviewHandCount(l)} review hands from only ${reviewLeavesFor(l).length} earlier leaf/leaves`,
    );
  }
  console.log(
    `OK  ${biddingCurriculum.lessons.length} lessons x ${RUNS} runs: quotas hold, own leaves evenly covered, ${total} hands across the course`,
  );
}

main();
