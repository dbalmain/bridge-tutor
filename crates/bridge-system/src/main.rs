use std::env;
use std::time::Instant;

use rand::rngs::SmallRng;
use rand::SeedableRng;

use bridge_system::deal::generate_for_id;
use bridge_system::leaves::catalog;
use bridge_system::progress::Progress;

fn main() {
    let mut args = env::args().skip(1);
    let cmd = args.next().unwrap_or_else(|| "help".into());
    match cmd.as_str() {
        "catalog" => println!("{}", bridge_system::api::catalog_json()),
        "prove-leaves" => prove(args.next()),
        "deal" => {
            let id = args.next().expect("leaf id");
            let seed: u32 = args.next().and_then(|s| s.parse().ok()).unwrap_or(1);
            println!(
                "{}",
                bridge_system::api::next_drill_json("{}", seed, &id, &[])
            );
        }
        "weights" => {
            let progress = args.next().unwrap_or_else(|| "{}".into());
            println!("{}", bridge_system::api::weights_json(&progress, "all"));
        }
        "record" => {
            let progress = args.next().unwrap_or_else(|| "{}".into());
            let id = args.next().expect("leaf id");
            let correct = args.next().is_none_or(|s| s != "wrong");
            print!(
                "{}",
                bridge_system::api::apply_result_json(&progress, &id, correct)
            );
        }
        "decide" => {
            let hand = args.next().expect("cards");
            let auction = args.next().unwrap_or_else(|| "[]".into());
            println!("{}", bridge_system::api::decide_json(&hand, &auction));
        }
        "serve" => bridge_system::server::serve(),
        _ => {
            eprintln!(
                "bridge-system catalog | prove-leaves [seed] | deal <leaf-id> [seed]\n\
                 bridge-system decide <SA,SK,...> [auction-json]\n\
                 bridge-system weights [progress-json]\n\
                 bridge-system record [progress-json] <leaf-id> [wrong]\n\
                 bridge-system serve          # HTTP sidecar, default port 8788"
            );
            let _ = Progress::default();
        }
    }
}

fn prove(seed: Option<String>) {
    let seed: u64 = seed.and_then(|s| s.parse().ok()).unwrap_or(20260828);
    let mut rng = SmallRng::seed_from_u64(seed);
    let t0 = Instant::now();
    let mut worst: u32 = 0;
    let mut worst_id = "";
    let mut failed = 0;
    for spec in catalog() {
        match generate_for_id(&mut rng, spec.id) {
            Ok((_, attempts)) => {
                if attempts > worst {
                    worst = attempts;
                    worst_id = spec.id;
                }
                println!("ok  {:>5}  {}", attempts, spec.id);
            }
            Err(e) => {
                failed += 1;
                println!("FAIL {}  {}", spec.id, e.message);
            }
        }
    }
    println!(
        "\n{} leaves, {failed} failed, worst {worst_id} ({worst} tries), {:?}",
        catalog().len(),
        t0.elapsed()
    );
    if failed > 0 {
        std::process::exit(1);
    }
}
