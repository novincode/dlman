use serde_json::json;
use std::fmt::Debug;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::{Context, Layer};
use tracing_subscriber::registry::LookupSpan;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

#[derive(Default)]
struct FieldVisitor {
    message: Option<String>,
    fields: serde_json::Map<String, serde_json::Value>,
}

impl FieldVisitor {
    fn record_value(&mut self, field: &Field, value: serde_json::Value) {
        if field.name() == "message" {
            if let Some(s) = value.as_str() {
                self.message = Some(s.to_string());
            } else {
                self.message = Some(value.to_string());
            }
            return;
        }

        self.fields.insert(field.name().to_string(), value);
    }
}

impl Visit for FieldVisitor {
    fn record_i64(&mut self, field: &Field, value: i64) {
        self.record_value(field, json!(value));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.record_value(field, json!(value));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.record_value(field, json!(value));
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.record_value(field, json!(value));
    }

    fn record_debug(&mut self, field: &Field, value: &dyn Debug) {
        self.record_value(field, json!(format!("{:?}", value)));
    }
}

#[derive(Default)]
pub struct TauriLogForwardLayer;

impl<S> Layer<S> for TauriLogForwardLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let Some(app_handle) = APP_HANDLE.get() else {
            return;
        };

        let metadata = event.metadata();
        let mut visitor = FieldVisitor::default();
        event.record(&mut visitor);

        let level = match *metadata.level() {
            Level::ERROR => "error",
            Level::WARN => "warn",
            Level::INFO => "info",
            Level::DEBUG | Level::TRACE => "debug",
        };

        let message = visitor
            .message
            .unwrap_or_else(|| metadata.name().to_string());

        let payload = json!({
            "level": level,
            "message": message,
            "target": metadata.target(),
            "module": metadata.module_path(),
            "file": metadata.file(),
            "line": metadata.line(),
            "fields": visitor.fields,
        });

        // Important: never call `tracing::*` here; it would recurse.
        let _ = app_handle.emit("backend-log", payload);
    }
}
