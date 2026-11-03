//! Live check (network): cargo run -p dlman-core --example social_live -- <YouTube/Facebook/TikTok link>

use dlman_core::{social, DlmanCore};
#[tokio::main]
async fn main() {
    let link = std::env::args().nth(1).unwrap();
    let want = std::env::args().nth(2); // a format id, e.g. tt-audio; default: the first
    let v = match social::resolve(&link).await { Ok(v) => v, Err(e) => { println!("RESOLVE-ERR {e}"); return } };
    println!("RESOLVED {} {:?}", v.title, v.formats.iter().map(|f| &f.label).collect::<Vec<_>>());
    let dir = std::env::temp_dir().join("dlman-tt");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("data")).unwrap();
    let core = DlmanCore::new(dir.join("data")).await.unwrap();
    let f = v.formats.iter().find(|f| want.as_deref().map_or(true, |w| f.id == w)).unwrap().clone();
    println!("FORMAT {} {}", f.id, f.label);
    core.add_social_download(&link, &f.id, dir.join("out"), uuid::Uuid::nil()).await.unwrap();
    let t = std::time::Instant::now();
    while t.elapsed().as_secs() < 240 {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let ds = core.get_all_downloads().await.unwrap();
        // Done when the entry finished and no audio is still waiting in the cache to be joined.
        // (YouTube HD: the audio is fetched after the video completes, then joined in.)
        let needs_audio = f.audio_url.is_some() || f.extract_audio;
        let joined = ds.first().map_or(false, |d| d.size.map_or(false, |n| if f.extract_audio { std::fs::read_dir(dir.join("out/.dlman-cache")).map(|r| r.count() == 0).unwrap_or(true) && n > 0 } else { f.size.map_or(true, |s| n >= s) }) && d.error.is_none());
        let joining = std::fs::read_dir(dir.join("out/.dlman-cache")).map(|r| r.count() > 0).unwrap_or(false)
            || (needs_audio && !joined);
        if !joining && ds.iter().all(|d| matches!(d.status, dlman_types::DownloadStatus::Completed | dlman_types::DownloadStatus::Failed)) {
            for d in ds { println!("STATE {:?} {:?} {:?}", d.status, d.size, d.error); }
            return;
        }
    }
    println!("timeout");
}
