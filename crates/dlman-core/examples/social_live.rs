//! Live check (network): cargo run -p dlman-core --example social_live -- <YouTube/Facebook/TikTok link>

use dlman_core::{social, DlmanCore};
#[tokio::main]
async fn main() {
    let link = std::env::args().nth(1).unwrap();
    let v = social::resolve(&link).await.unwrap();
    println!("RESOLVED {} {:?}", v.title, v.formats.iter().map(|f| &f.label).collect::<Vec<_>>());
    let dir = std::env::temp_dir().join("dlman-tt");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("data")).unwrap();
    let core = DlmanCore::new(dir.join("data")).await.unwrap();
    core.add_social_download(&link, &v.formats[0].id, dir.join("out"), uuid::Uuid::nil()).await.unwrap();
    let t = std::time::Instant::now();
    while t.elapsed().as_secs() < 240 {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let ds = core.get_all_downloads().await.unwrap();
        // Done when the entry finished and no audio is still waiting in the cache to be joined.
        // (YouTube HD: the audio is fetched after the video completes, then joined in.)
        let needs_audio = v.formats[0].audio_url.is_some();
        let joined = ds.first().map_or(false, |d| d.size.map_or(false, |n| v.formats[0].size.map_or(true, |s| n >= s)) && d.error.is_none());
        let joining = std::fs::read_dir(dir.join("out/.dlman-cache")).map(|r| r.count() > 0).unwrap_or(false)
            || (needs_audio && !joined);
        if !joining && ds.iter().all(|d| matches!(d.status, dlman_types::DownloadStatus::Completed | dlman_types::DownloadStatus::Failed)) {
            for d in ds { println!("STATE {:?} {:?} {:?}", d.status, d.size, d.error); }
            return;
        }
    }
    println!("timeout");
}
