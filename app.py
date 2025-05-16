import os
import re
import hashlib
import requests
from datetime import datetime, timezone
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
import atexit

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Change this in production

# Configure the SQLite database
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'channels.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ---------------------------
# Database Models
# ---------------------------
class Feed(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(512), unique=True, nullable=False)
    added_on = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Feed {self.url}>'

class Channel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stream_id = db.Column(db.String(128), unique=True, nullable=False)
    name = db.Column(db.String(256))
    logo = db.Column(db.String(512))
    category = db.Column(db.String(128))
    country = db.Column(db.String(64))
    url = db.Column(db.String(512))
    state = db.Column(db.String(32))  # active, inactive, discontinued
    last_seen = db.Column(db.DateTime)
    added_on = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Channel {self.name} ({self.state})>'

with app.app_context():
    db.create_all()

# ---------------------------
# Utility: Parse M3U/M3U8 Playlists
# ---------------------------
def parse_m3u(content):
    """
    Parses an M3U/M3U8 playlist and returns a list of channel dictionaries.
    Each dictionary contains: stream_id, name, logo, category, url.
    """
    channels = []
    lines = content.splitlines()
    current_channel = {}
    # Allow hyphens in attribute keys
    attr_pattern = re.compile(r'([\w-]+)="(.*?)"')
    
    for line in lines:
        line = line.strip()
        if line.startswith("#EXTINF:"):
            info_line = line[len("#EXTINF:"):].strip()
            attrs = dict(attr_pattern.findall(info_line))
            # The display name is the text after the comma if present
            if ',' in info_line:
                display_name = info_line.split(',', 1)[1].strip()
            else:
                display_name = attrs.get('tvg-name', 'Unknown')
            current_channel = {
                'stream_id': attrs.get('tvg-id') or hashlib.md5((display_name + line).encode('utf-8')).hexdigest(),
                'name': attrs.get('tvg-name') or display_name,
                'logo': attrs.get('tvg-logo'),
                'category': attrs.get('group-title'),
                'country': None,
            }
        elif line and not line.startswith("#"):
            current_channel['url'] = line
            channels.append(current_channel)
            current_channel = {}
    return channels

# ---------------------------
# Utility: Check if Channel URL is Playable
# ---------------------------
def is_channel_playable(url, timeout=5):
    try:
        response = requests.head(url, timeout=timeout)
        if response.status_code < 200 or response.status_code >= 300:
            response = requests.get(url, stream=True, timeout=timeout)
        return 200 <= response.status_code < 300
    except Exception:
        return False

# ---------------------------
# Sync Logic for Multiple Feeds with Immediate Scan
# ---------------------------
def sync_all_feeds():
    """
    Iterates over all feeds, fetches and parses each playlist,
    aggregates channels, and updates/inserts channels accordingly.
    Channels not found in any feed are marked as discontinued.
    New channels are immediately tested: if playable, they're set to active.
    Returns a tuple (success, message) with the count of new channels added.
    """
    feeds = Feed.query.all()
    union_channels = {}
    now = datetime.now(timezone.utc)
    new_count = 0

    for feed in feeds:
        try:
            response = requests.get(feed.url)
            response.raise_for_status()
            content = response.text
            parsed = parse_m3u(content)
            for ch in parsed:
                union_channels[ch['stream_id']] = ch
        except Exception as e:
            app.logger.error(f"Error fetching feed {feed.url}: {e}")

    existing_channels = {ch.stream_id: ch for ch in Channel.query.all()}

    for stream_id, ch in union_channels.items():
        if stream_id in existing_channels:
            channel = existing_channels[stream_id]
            if channel.state != 'discontinued':
                channel.name = ch['name']
                channel.logo = ch.get('logo')
                channel.category = ch.get('category')
                channel.url = ch['url']
                channel.last_seen = now
        else:
            state = "active" if is_channel_playable(ch['url']) else "inactive"
            new_channel = Channel(
                stream_id=stream_id,
                name=ch['name'],
                logo=ch.get('logo'),
                category=ch.get('category'),
                url=ch['url'],
                state=state,
                last_seen=now,
                added_on=now
            )
            db.session.add(new_channel)
            new_count += 1

    for stream_id, channel in existing_channels.items():
        if stream_id not in union_channels:
            channel.state = 'discontinued'

    db.session.commit()
    return True, f"Feeds synced successfully. {new_count} new channels added."

# ---------------------------
# Scan Channels Logic (Manual Re-scan)
# ---------------------------
def scan_channels():
    active_channels = Channel.query.filter_by(state="active").all()
    deactivated_count = 0

    for channel in active_channels:
        if not is_channel_playable(channel.url):
            channel.state = "inactive"
            deactivated_count += 1

    db.session.commit()
    return deactivated_count

# ---------------------------
# Auto-Sync Scheduler (Weekly)
# ---------------------------
def scheduled_sync():
    success, message = sync_all_feeds()
    if success:
        app.logger.info("Auto-sync completed: " + message)
    else:
        app.logger.error("Auto-sync failed: " + message)

scheduler = BackgroundScheduler()
scheduler.add_job(func=scheduled_sync, trigger="interval", days=7)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

# ---------------------------
# Flask Endpoints
# ---------------------------
@app.route("/", methods=["GET"])
def index():
    """
    Main page: displays only active channels and the video player placeholder.
    """
    channels = Channel.query.filter_by(state="active").order_by(Channel.name).all()
    return render_template("index.html", channels=channels)

@app.route("/sync", methods=["POST"])
def sync():
    """
    Imports one or more feed URLs (one per line) and syncs all feeds.
    """
    playlist_urls = request.form.get("playlist_urls")
    if not playlist_urls:
        flash("At least one playlist URL is required.", "danger")
        return redirect(url_for("settings"))
    
    for url in playlist_urls.splitlines():
        url = url.strip()
        if url:
            existing = Feed.query.filter_by(url=url).first()
            if not existing:
                new_feed = Feed(url=url)
                db.session.add(new_feed)
    db.session.commit()

    success, message = sync_all_feeds()
    if success:
        flash(message, "success")
    else:
        flash("Error syncing feeds: " + message, "danger")
    return redirect(url_for("settings"))

@app.route("/scan", methods=["POST"])
def scan():
    """
    Manually scan active channels to verify their playability.
    """
    deactivated = scan_channels()
    flash(f"Scan complete. {deactivated} channel(s) were deactivated.", "info")
    return redirect(url_for("settings"))

@app.route("/channel/<int:channel_id>/activate", methods=["POST"])
def activate_channel(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    channel.state = "active"
    db.session.commit()
    return render_template("channel_row.html", channel=channel)

@app.route("/channel/<int:channel_id>/deactivate", methods=["POST"])
def deactivate_channel(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    channel.state = "inactive"
    db.session.commit()
    return render_template("channel_row.html", channel=channel)

@app.route("/channel/<int:channel_id>/delete", methods=["POST"])
def delete_channel(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    db.session.delete(channel)
    db.session.commit()
    return "", 204

@app.route("/play/<int:channel_id>", methods=["GET"])
def play_channel(channel_id):
    """
    Returns an inline video player snippet for the selected channel.
    Only active channels should be playable.
    """
    channel = Channel.query.get_or_404(channel_id)
    return render_template("player.html", channel=channel)

@app.route("/fullplayer/<int:channel_id>", methods=["GET"])
def fullplayer(channel_id):
    """
    A full-width player page for the selected channel.
    """
    channel = Channel.query.get_or_404(channel_id)
    return render_template("fullplayer.html", channel=channel)

@app.route("/settings", methods=["GET"])
def settings():
    """
    Settings page: shows all channels (with their statuses), feed controls,
    scan controls, and bulk operations.
    """
    channels = Channel.query.order_by(Channel.name).all()
    feeds = Feed.query.order_by(Feed.added_on).all()
    return render_template("settings.html", channels=channels, feeds=feeds)

@app.route("/bulk_delete", methods=["POST"])
def bulk_delete():
    channel_ids = request.form.getlist("channel_ids")
    if not channel_ids:
        flash("No channels selected for deletion.", "warning")
        return redirect(url_for("settings"))
    count = 0
    for cid in channel_ids:
        channel = Channel.query.get(cid)
        if channel:
            db.session.delete(channel)
            count += 1
    db.session.commit()
    flash(f"Deleted {count} channels.", "success")
    return redirect(url_for("settings"))

@app.route("/bulk_update", methods=["POST"])
def bulk_update():
    channel_ids = request.form.getlist("channel_ids")
    new_state = request.form.get("new_state")
    if not channel_ids or not new_state:
        flash("No channels selected or no state provided.", "warning")
        return redirect(url_for("settings"))
    count = 0
    for cid in channel_ids:
        channel = Channel.query.get(cid)
        if channel:
            channel.state = new_state
            count += 1
    db.session.commit()
    flash(f"Updated state for {count} channels to '{new_state}'.", "success")
    return redirect(url_for("settings"))

if __name__ == "__main__":
    app.run(debug=True)
