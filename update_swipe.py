import sys

with open("app/(tabs)/messages.tsx", "r", encoding="utf-8") as f:
    content = f.read()

renderItem_target = """    const renderLeftActions = () => {
      return (
        <TouchableOpacity style={styles.leftAction} onPress={() => confirmDelete(item.id)}>
          <Ionicons name="trash" size={24} color="white" />
          <Text style={styles.actionText}>Sil</Text>
        </TouchableOpacity>
      );
    };

    const renderRightActions = () => {
      return (
        <TouchableOpacity 
          style={[styles.rightAction, { backgroundColor: isMuted ? Colors.warning : Colors.textLight }]} 
          onPress={() => handleToggleMute(item.id, isMuted || false)}
        >
          <Ionicons name={isMuted ? "volume-medium" : "volume-mute"} size={24} color="white" />
          <Text style={styles.actionText}>{isMuted ? "Sesi Aç" : "Sessiz"}</Text>
        </TouchableOpacity>
      );
    };"""

renderItem_replace = """    const renderLeftActions = (progress: any, dragX: any) => {
      const trans = dragX.interpolate({
        inputRange: [0, 80],
        outputRange: [-30, 0],
        extrapolate: 'clamp',
      });
      const opacity = dragX.interpolate({
        inputRange: [0, 40, 80],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      });
      return (
        <View style={styles.leftAction}>
          <Animated.View style={[styles.actionContent, { opacity, transform: [{ translateX: trans }] }]}>
            <Ionicons name="trash" size={24} color="white" />
            <Text style={styles.actionText}>Sil</Text>
          </Animated.View>
        </View>
      );
    };

    const renderRightActions = (progress: any, dragX: any) => {
      const trans = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [0, 30],
        extrapolate: 'clamp',
      });
      const opacity = dragX.interpolate({
        inputRange: [-80, -40, 0],
        outputRange: [1, 0.5, 0],
        extrapolate: 'clamp',
      });
      return (
        <View style={[styles.rightAction, { backgroundColor: isMuted ? Colors.warning : Colors.textLight }]}>
          <Animated.View style={[styles.actionContent, { opacity, transform: [{ translateX: trans }] }]}>
            <Ionicons name={isMuted ? "volume-medium" : "volume-mute"} size={24} color="white" />
            <Text style={styles.actionText}>{isMuted ? "Sesi Aç" : "Sessiz"}</Text>
          </Animated.View>
        </View>
      );
    };"""
content = content.replace(renderItem_target, renderItem_replace)

styles_target = """  leftAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  rightAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    fontFamily: Typography.semiBold
  },"""

styles_replace = """  leftAction: {
    flex: 1,
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 24,
  },
  rightAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  actionContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    fontFamily: Typography.semiBold
  },"""
content = content.replace(styles_target, styles_replace)

chatItem_target = """  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },"""

chatItem_replace = """  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },"""
content = content.replace(chatItem_target, chatItem_replace)

with open("app/(tabs)/messages.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
