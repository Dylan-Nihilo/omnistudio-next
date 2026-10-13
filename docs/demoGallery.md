# Demo 合集

登录后的首页展示《拼回去》第一集，可以观看成片或打开制作画布。

样板资源保存在持久化数据目录的 `demos/admissionCounterattack/`，与应用镜像分别部署。该目录包含 `episodeOne.json`、`demoSource.json`（`{"id":"admissionCounterattack"}`）以及画布引用的相对路径素材。横版封面为 `assets/demoCover/coverLandscape.webp`，成片为 `assets/d37fdb2d-4b99-461b-ae29-cf6775945f85/episodeOneFinalV1.mp4`。资源缺失时首页不展示 Demo；不将私人成本账本、账户配置或供应商账单包含在样板中。

`GET /api/demos/get` 返回合集；`GET /api/demos/file` 提供封面和支持 Range 的视频。接口沿用现有登录权限，写入接口同时沿用 CSRF 校验。

`POST /api/demos/open` 将样板复制到当前用户个人空间的 `admissionCounterattackDemo`，随后注册项目。再次打开沿用已有副本，保留用户编辑；同名非样板项目不覆盖。复制完成前不会发布目标目录。原始样板与其他用户的副本互不修改。
