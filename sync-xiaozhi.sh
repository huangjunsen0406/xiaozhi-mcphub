# 0) 变量（如需改路径，这里改）
WORKROOT="/Users/junsen/Desktop/workspace"
YOUR_SNAPSHOT="$WORKROOT/xiaozhi-mcphub"          # 你当前项目（无.git 的快照）
UPSTREAM_CLONE="$WORKROOT/mcphub-sync"            # 临时工作区
UPSTREAM_URL="https://github.com/samanhappy/mcphub.git"
YOUR_REMOTE="https://github.com/huangjunsen0406/xiaozhi-mcphub.git"
PORT_BRANCH="xiaozhi-port"                        # 承载你改动的分支
UPSTREAM_TRACK_BRANCH="upstream-main"             # 在你仓库里跟随上游的纯净分支

# 1) 备份你的快照目录（保险）
cp -a "$YOUR_SNAPSHOT" "${YOUR_SNAPSHOT}.backup"

# 2) 克隆上游，建立承载你改动的分支
rm -rf "$UPSTREAM_CLONE"
git clone "$UPSTREAM_URL" "$UPSTREAM_CLONE"
cd "$UPSTREAM_CLONE"
git switch -c "$PORT_BRANCH"

# 3) 把你的快照覆盖到上游代码上（形成“你的改动”）
#    建议排除常见产物，减少无意义差异；按需增删排除项
rsync -av --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "dist" \
  --exclude "build" \
  --exclude ".next" \
  --exclude ".DS_Store" \
  "$YOUR_SNAPSHOT"/ "$UPSTREAM_CLONE"/

# 4) 提交你的改动
git status
git add -A
git commit -m "Port local xiaozhi changes onto upstream HEAD"

# 5) 在你的 GitHub 仓库里保留两条分支：纯净上游 & 你的改动
#    5.1 推送“纯净上游主线”到你的仓库，命名为 upstream-main
git fetch origin
git push "$YOUR_REMOTE" origin/main:"$UPSTREAM_TRACK_BRANCH"

#    5.2 推送你的改动分支
git push -u "$YOUR_REMOTE" "$PORT_BRANCH"

# 6) （可选但推荐）把工作区也绑定你自己的远端，方便后续直接 push
git remote remove origin
git remote add origin "$YOUR_REMOTE"
# 确保本地有与上游 main 对齐的一份分支
git fetch "$UPSTREAM_URL" main:refs/remotes/upstream/main
git branch -f "$UPSTREAM_TRACK_BRANCH" remotes/upstream/main
