//! DLMan CLI - Command-line download manager
//!
//! A powerful CLI tool for managing downloads with multi-segment acceleration.

mod commands;
mod output;
mod progress;

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// DLMan - Modern Download Manager
#[derive(Parser)]
#[command(name = "dlman")]
#[command(author, version, about, long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    /// Data directory for DLMan
    #[arg(long, env = "DLMAN_DATA_DIR")]
    data_dir: Option<PathBuf>,

    /// Output format
    #[arg(long, default_value = "human")]
    output: OutputFormat,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, Copy, Debug, clap::ValueEnum)]
enum OutputFormat {
    Human,
    Json,
    Table,
}

#[derive(Subcommand)]
enum Commands {
    /// Add a new download
    Add {
        /// URL to download
        url: String,

        /// Output file path
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Queue ID to add to
        #[arg(short, long)]
        queue: Option<String>,

        /// Number of segments for parallel download
        #[arg(short, long)]
        segments: Option<u32>,

        /// Start download immediately
        #[arg(short = 'n', long)]
        now: bool,
    },

    /// List downloads
    List {
        /// Filter by status
        #[arg(short, long)]
        status: Option<String>,

        /// Filter by queue
        #[arg(short, long)]
        queue: Option<String>,

        /// Show all details
        #[arg(short, long)]
        all: bool,
    },

    /// Show download info
    Info {
        /// Download ID or URL
        id: String,
    },

    /// Pause a download
    Pause {
        /// Download ID
        id: String,
    },

    /// Resume a download
    Resume {
        /// Download ID
        id: String,
    },

    /// Cancel a download
    Cancel {
        /// Download ID
        id: String,
    },

    /// Delete a download
    Delete {
        /// Download ID
        id: String,

        /// Also delete the downloaded file
        #[arg(long)]
        with_file: bool,
    },

    /// Queue management
    Queue {
        #[command(subcommand)]
        action: QueueAction,
    },

    /// Probe a URL for information
    Probe {
        /// URLs to probe
        urls: Vec<String>,
    },

    /// Import data from JSON
    Import {
        /// Path to JSON file
        file: PathBuf,
    },

    /// Export data to JSON
    Export {
        /// Output path
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Show/update settings
    Config {
        #[command(subcommand)]
        action: Option<ConfigAction>,
    },

    /// Generate shell completions
    Completions {
        /// Shell to generate completions for
        shell: clap_complete::Shell,
    },
}

#[derive(Subcommand)]
enum QueueAction {
    /// List all queues
    List,

    /// Create a new queue
    Create {
        /// Queue name
        name: String,

        /// Color (hex)
        #[arg(long)]
        color: Option<String>,

        /// Max concurrent downloads
        #[arg(long)]
        max_concurrent: Option<u32>,

        /// Speed limit in bytes/sec
        #[arg(long)]
        speed_limit: Option<u64>,
    },

    /// Delete a queue
    Delete {
        /// Queue ID
        id: String,
    },

    /// Start a queue
    Start {
        /// Queue ID
        id: String,
    },

    /// Stop a queue
    Stop {
        /// Queue ID
        id: String,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Get a config value
    Get {
        /// Config key
        key: String,
    },

    /// Set a config value
    Set {
        /// Config key
        key: String,

        /// Config value
        value: String,
    },

    /// Show all config
    Show,

    /// Reset to defaults
    Reset,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Determine data directory
    let data_dir = cli.data_dir.unwrap_or_else(|| {
        dirs::data_dir()
            .map(|d| d.join("dlman"))
            .unwrap_or_else(|| PathBuf::from(".dlman"))
    });

    // Initialize core
    let core = dlman_core::DlmanCore::new(data_dir).await?;

    // Execute command
    match cli.command {
        Commands::Add {
            url,
            output,
            queue,
            segments: _,
            now: _,
        } => commands::add_download(&core, &url, output, queue, cli.output).await?,

        Commands::List { status, queue, all } => {
            commands::list_downloads(&core, status, queue, all, cli.output).await?
        }

        Commands::Info { id } => commands::show_info(&core, &id, cli.output).await?,

        Commands::Pause { id } => commands::pause_download(&core, &id, cli.output).await?,

        Commands::Resume { id } => commands::resume_download(&core, &id, cli.output).await?,

        Commands::Cancel { id } => commands::cancel_download(&core, &id, cli.output).await?,

        Commands::Delete { id, with_file } => {
            commands::delete_download(&core, &id, with_file, cli.output).await?
        }

        Commands::Queue { action } => commands::queue_action(&core, action, cli.output).await?,

        Commands::Probe { urls } => commands::probe_urls(&core, urls, cli.output).await?,

        Commands::Import { file } => commands::import_data(&core, file, cli.output).await?,

        Commands::Export { output } => commands::export_data(&core, output, cli.output).await?,

        Commands::Config { action } => commands::config_action(&core, action, cli.output).await?,

        Commands::Completions { shell } => {
            use clap::CommandFactory;
            clap_complete::generate(shell, &mut Cli::command(), "dlman", &mut std::io::stdout());
        }
    }

    Ok(())
}
