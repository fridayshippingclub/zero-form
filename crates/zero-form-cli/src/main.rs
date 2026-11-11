use anyhow::{Context, Result, ensure};
use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;
use zero_form_core::{contracts::*, definition::*, facts::*, package::*, pdf::*};

#[derive(Parser)]
#[command(
    name = "zero-form",
    about = "Compile authorized semantic facts into verified PDF application packages"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}
#[derive(Args)]
struct Case {
    #[arg(long)]
    definition: PathBuf,
    #[arg(long)]
    snapshot: PathBuf,
    #[arg(long, default_value = ".")]
    assets: PathBuf,
    #[arg(long)]
    candidate: PathBuf,
}
#[derive(Subcommand)]
enum Commands {
    Doctor,
    Schema,
    Inspect {
        input: PathBuf,
    },
    CheckDefinition {
        input: PathBuf,
    },
    Prepare {
        #[arg(long)]
        definition: PathBuf,
        #[arg(long)]
        request: PathBuf,
        #[arg(long)]
        fixture_facts: PathBuf,
        #[arg(long)]
        now: String,
        #[arg(long)]
        out: PathBuf,
    },
    Render {
        #[command(flatten)]
        case: Case,
    },
    Verify {
        #[command(flatten)]
        case: Case,
    },
    Publish {
        #[command(flatten)]
        case: Case,
        #[arg(long)]
        fixture_facts: PathBuf,
        #[arg(long)]
        now: String,
        #[arg(long)]
        out: PathBuf,
    },
    Run {
        #[arg(long)]
        definition: PathBuf,
        #[arg(long)]
        request: PathBuf,
        #[arg(long)]
        fixture_facts: PathBuf,
        #[arg(long)]
        now: String,
        #[arg(long, default_value = ".")]
        assets: PathBuf,
        #[arg(long)]
        out: PathBuf,
    },
}
fn execute(cli: Cli) -> Result<serde_json::Value> {
    let tools = Tools::default();
    Ok(match cli.command {
        Commands::Doctor => doctor(&tools)?,
        Commands::Schema => {
            serde_json::json!({"definition":zero_form_core::wire_schemas().0,"request":zero_form_core::wire_schemas().1,"fixture_facts":zero_form_core::wire_schemas().2})
        }
        Commands::Inspect { input } => serde_json::to_value(inspect_template(&input)?)?,
        Commands::CheckDefinition { input } => {
            let b: DefinitionBundle = read_json(&input)?;
            check_definition(&b)?;
            serde_json::json!({"status":"valid","definition_hash":hash_json(&b)?})
        }
        Commands::Prepare {
            definition,
            request,
            fixture_facts,
            now,
            out,
        } => {
            let b = read_json(&definition)?;
            let r = read_json(&request)?;
            let f = FixtureSource(read_json(&fixture_facts)?);
            let prepared = zero_form_core::prepare_application(&b, r, &f, &now)?;
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            write_json(&out, &prepared.snapshot)?;
            if !prepared.issues.is_empty() {
                println!("{}", serde_json::to_string(&prepared)?);
                anyhow::bail!("application_needs_data");
            }
            serde_json::json!({"status":"prepared","snapshot_hash":prepared.snapshot.hash,"path":out,"trust_mode":"fixture_only"})
        }
        Commands::Render { case } => {
            render_application(
                &read_json(&case.definition)?,
                &read_json(&case.snapshot)?,
                &case.assets,
                &case.candidate,
                &tools,
            )?;
            serde_json::json!({"status":"candidate","path":case.candidate})
        }
        Commands::Verify { case } => serde_json::to_value(verify_application(
            &read_json(&case.definition)?,
            &read_json(&case.snapshot)?,
            &case.assets,
            &case.candidate,
            &tools,
        )?)?,
        Commands::Publish {
            case,
            fixture_facts,
            now,
            out,
        } => {
            let path = publish_application(
                &read_json(&case.definition)?,
                &read_json(&case.snapshot)?,
                PublicationPaths {
                    assets: &case.assets,
                    candidate: &case.candidate,
                    output: &out,
                },
                &FixtureSource(read_json(&fixture_facts)?),
                &now,
                &tools,
            )?;
            serde_json::json!({"status":"published","path":path,"trust_mode":"fixture_only"})
        }
        Commands::Run {
            definition,
            request,
            fixture_facts,
            now,
            assets,
            out,
        } => {
            ensure!(!out.exists(), "output_already_exists");
            let bundle: DefinitionBundle = read_json(&definition)?;
            let source = FixtureSource(read_json(&fixture_facts)?);
            let prepared =
                zero_form_core::prepare_application(&bundle, read_json(&request)?, &source, &now)?;
            if !prepared.issues.is_empty() {
                println!("{}", serde_json::to_string(&prepared)?);
                anyhow::bail!("application_needs_data");
            }
            let parent = out.parent().context("output_parent_required")?;
            std::fs::create_dir_all(parent)?;
            let candidate = parent.join(format!(".{}-candidate", prepared.snapshot.request.id));
            render_application(&bundle, &prepared.snapshot, &assets, &candidate, &tools)?;
            publish_application(
                &bundle,
                &prepared.snapshot,
                PublicationPaths {
                    assets: &assets,
                    candidate: &candidate,
                    output: &out,
                },
                &source,
                &now,
                &tools,
            )?;
            serde_json::json!({"status":"published","path":out,"snapshot_hash":prepared.snapshot.hash,"trust_mode":"fixture_only"})
        }
    })
}
fn main() {
    match execute(Cli::parse()) {
        Ok(value) => println!("{}", serde_json::to_string_pretty(&value).unwrap()),
        Err(error) => {
            eprintln!(
                "{}",
                serde_json::json!({"status":"error","code":error.to_string().split(':').next().unwrap_or("engine_error"),"message":format!("{error:#}")})
            );
            std::process::exit(1);
        }
    }
}
