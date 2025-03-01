import os
import re
import hashlib
import requests
from datetime import datetime
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
    added_on = db.Column(db.DateTime, default=datetime.utcnow)

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
    added_on = db.Column(db.DateTime, default=datetime.utcnow)

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
    attr_pattern = re.compile(r'(\w+?)="(.*?)"')
    
    for line in lines:
        line = line.strip()
        if line.startswith("#EXTINF:"):
            info_line = line[len("#EXTINF:"):].strip()
            attrs = dict(attr_pattern.findall(info_line))
            if ',' in info_line:
                display_name = info_line.split(',', 1)[1].strip()
            else:
                display_name = attrs.get('tvg-name', 'Unknown')
            current_channel = {
                'stream_id': attrs.get('tvg-id') or hashlib.md5((display_name + line).encode('utf-8')).hexdigest(),
                'name': attrs.get('tvg-name') or display_name,
                'logo': attrs.get('tvg-logo'),
                'category': attrs.get('group-title'),
                'country': None,  # Extend if country info is available
            }
        elif line and not line.startswith("#"):
            current_channel['url'] = line
            channels.append(current_channel)
            current_channel = {}
    return channels

# ---------------------------
# Sync Logic for Multiple Feeds
# ---------------------------
def sync_all_feeds():
    """
    Iterates over all feeds in the Feed table, fetches and parses each playlist,
    and builds a union of channels. Updates/inserts channels accordingly.
    Channels not present in any feed are marked as discontinued.
    """
    feeds = Feed.query.all()
    union_channels = {}  # stream_id -> channel data dictionary
    now = datetime.utcnow()

    # Loop over all feeds and aggregate channels.
    for feed in feeds:
        try:
            response = requests.get(feed.url)
            response.raise_for_status()
            content = response.text
            parsed = parse_m3u(content)
            for ch in parsed:
                # If channel already exists, we update metadata later.
                union_channels[ch['stream_id']] = ch
        except Exception as e:
            app.logger.error(f"Error fetching feed {feed.url}: {e}")

    # Load existing channels from DB
    existing_channels = {ch.stream_id: ch for ch in Channel.query.all()}

    # Update or add channels from the union of all feeds
    for stream_id, ch in union_channels.items():
        if stream_id in existing_channels:
            channel = existing_channels[stream_id]
            # Update metadata if channel is not marked as discontinued
            if channel.state != 'discontinued':
                channel.name = ch['name']
                channel.logo = ch.get('logo')
                channel.category = ch.get('category')
                channel.url = ch['url']
                channel.last_seen = now
        else:
            # New channels added as inactive (pending review)
            new_channel = Channel(
                stream_id=stream_id,
                name=ch['name'],
                logo=ch.get('logo'),
                category=ch.get('category'),
                url=ch['url'],
                state='inactive',
                last_seen=now,
                added_on=now
            )
            db.session.add(new_channel)

    # Mark channels not found in any feed as discontinued.
    for stream_id, channel in existing_channels.items():
        if stream_id not in union_channels:
            channel.state = 'discontinued'

    db.session.commit()
    return True, "Feeds synced successfully."

# ---------------------------
# Scan Channels Logic
# ---------------------------
def scan_channels():
    """
    Scans active channels by attempting to fetch their stream URLs.
    Channels that return a bad status code or fail are deactivated.
    """
    active_channels = Channel.query.filter_by(state="active").all()
    deactivated_count = 0

    for channel in active_channels:
        try:
            response = requests.head(channel.url, timeout=5)
            if response.status_code >= 400:
                response = requests.get(channel.url, stream=True, timeout=5)
            if response.status_code < 200 or response.status_code >= 300:
                channel.state = "inactive"
                deactivated_count += 1
        except Exception:
            channel.state = "inactive"
            deactivated_count += 1

    db.session.commit()
    return deactivated_count

# ---------------------------
# Auto-Sync Scheduler (Weekly by Default)
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
# Flask Routes
# ---------------------------

@app.route("/", methods=["GET"])
def index():
    """
    Main page displays channels (filtered by state) and the video player.
    """
    filter_state = request.args.get("state", "active")
    if filter_state not in ["active", "inactive", "discontinued"]:
        filter_state = "active"
    channels = Channel.query.filter_by(state=filter_state).order_by(Channel.name).all()
    feeds = Feed.query.order_by(Feed.added_on).all()
    return render_template("index.html", channels=channels, filter_state=filter_state, feeds=feeds)

@app.route("/sync", methods=["POST"])
def sync():
    """
    Imports one or more feed URLs (one per line) and syncs all feeds.
    """
    playlist_urls = request.form.get("playlist_urls")
    if not playlist_urls:
        flash("At least one playlist URL is required.", "danger")
        return redirect(url_for("index"))
    
    # Process multiple URLs (one per line)
    for url in playlist_urls.splitlines():
        url = url.strip()
        if url:
            # Add feed if it doesn't already exist
            existing = Feed.query.filter_by(url=url).first()
            if not existing:
                new_feed = Feed(url=url)
                db.session.add(new_feed)
    db.session.commit()

    # Now sync all feeds
    success, message = sync_all_feeds()
    if success:
        flash("Feeds synced successfully.", "success")
    else:
        flash("Error syncing feeds: " + message, "danger")
    return redirect(url_for("index"))

@app.route("/scan", methods=["POST"])
def scan():
    """
    Scan active channels by checking their stream URLs.
    Channels with errors are set to inactive.
    """
    deactivated = scan_channels()
    flash(f"Scan complete. {deactivated} channel(s) were deactivated.", "info")
    return redirect(url_for("index"))

@app.route("/channel/<int:channel_id>/activate", methods=["POST"])
def activate_channel(channel_id):
    """
    Activate a channel so it appears in the active list.
    """
    channel = Channel.query.get_or_404(channel_id)
    channel.state = "active"
    db.session.commit()
    return render_template("channel_row.html", channel=channel)

@app.route("/channel/<int:channel_id>/deactivate", methods=["POST"])
def deactivate_channel(channel_id):
    """
    Deactivate a channel.
    """
    channel = Channel.query.get_or_404(channel_id)
    channel.state = "inactive"
    db.session.commit()
    return render_template("channel_row.html", channel=channel)

@app.route("/channel/<int:channel_id>/delete", methods=["POST"])
def delete_channel(channel_id):
    """
    Delete a channel. (It may reappear on the next sync if still in a feed.)
    """
    channel = Channel.query.get_or_404(channel_id)
    db.session.delete(channel)
    db.session.commit()
    return "", 204

@app.route("/play/<int:channel_id>", methods=["GET"])
def play_channel(channel_id):
    """
    Return a video player snippet for the selected channel.
    """
    channel = Channel.query.get_or_404(channel_id)
    return render_template("player.html", channel=channel)

if __name__ == "__main__":
    app.run(debug=True)
