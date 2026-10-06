//! The Frisbee server (`server/src/index.ts`).

fn main() {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("Failed to start server. {error}");
            std::process::exit(1);
        }
    };
    if let Err(error) = runtime.block_on(frisbee::server::bootstrap()) {
        eprintln!("Failed to start server. {error}");
        std::process::exit(1);
    }
}
